// Simulated TideCloak token issuer (server only). Tokens carry the same claims a Tide realm issues
// (iss, azp, sub, realm_access, resource_access, email_verified) and are signed with EdDSA, like Tide's
// non-rotating key. The app verifies them through the same path as live tokens: an adapter config with an
// embedded `jwk`. Nothing here is threshold cryptography; it only lets the app run as if Tide protected it.
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, type KeyObject } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SignJWT, type JWK } from "jose";
import type { TidecloakConfig } from "@tidecloak/nextjs/server";
import { SIM_CLIENT_ID, SIM_REALM, type SimUser } from "./realm";

export const SIM_TOKEN_TTL_SECONDS = 60 * 60;
const KID = "tidecloak-sim";
const store = globalThis as { __tideSimKeys?: { privateKey: KeyObject; publicJwk: JWK } };

export function simulationEnabled() {
  return process.env.AUTH_MODE === "tidecloak-sim" && process.env.ALLOW_INSECURE_DEV_AUTH === "true";
}

function keyFile() {
  return process.env.TIDE_SIM_KEY_FILE ?? join(process.cwd(), ".tidecloak-sim", "signing-key.json");
}

function keys() {
  if (store.__tideSimKeys) return store.__tideSimKeys;
  const file = keyFile();
  let privateJwk: JWK;
  try {
    privateJwk = JSON.parse(readFileSync(file, "utf8")) as JWK;
  } catch {
    privateJwk = generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" }) as JWK;
    mkdirSync(dirname(file), { recursive: true });
    try {
      writeFileSync(file, JSON.stringify(privateJwk), { flag: "wx", mode: 0o600 });
    } catch {
      privateJwk = JSON.parse(readFileSync(file, "utf8")) as JWK; // another request created it first
    }
  }
  const privateKey = createPrivateKey({ key: privateJwk as import("node:crypto").JsonWebKey, format: "jwk" });
  const publicJwk = { ...(createPublicKey(privateKey).export({ format: "jwk" }) as JWK), kid: KID, alg: "EdDSA", use: "sig" };
  store.__tideSimKeys = { privateKey, publicJwk };
  return store.__tideSimKeys;
}

function authServerUrl() {
  return `${(process.env.APP_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, "")}/sim-tidecloak`;
}

/** The simulated realm's adapter config (what tidecloak.json would hold), including the embedded JWKS. */
export function simulatedTideConfig(): TidecloakConfig {
  return {
    realm: SIM_REALM,
    "auth-server-url": authServerUrl(),
    resource: SIM_CLIENT_ID,
    "public-client": true,
    jwk: { keys: [keys().publicJwk] },
    tokenSignatureAlgorithms: ["EdDSA"],
  } as unknown as TidecloakConfig;
}

export async function issueSimulatedToken(user: SimUser, ttlSeconds = SIM_TOKEN_TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    typ: "Bearer",
    azp: SIM_CLIENT_ID,
    sid: randomUUID(),
    scope: "openid profile email",
    preferred_username: user.username,
    name: user.name,
    email: user.email,
    email_verified: true,
    realm_access: { roles: user.realmRoles },
    resource_access: { [SIM_CLIENT_ID]: { roles: [] } },
  })
    .setProtectedHeader({ alg: "EdDSA", kid: KID, typ: "JWT" })
    .setIssuer(`${authServerUrl()}/realms/${SIM_REALM}`)
    .setSubject(user.subject)
    .setAudience("account")
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .setJti(randomUUID())
    .sign(keys().privateKey);
}
