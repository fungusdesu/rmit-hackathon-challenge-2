import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import { verifyTideCloakToken } from "@tidecloak/verify";
import { issueSimulatedToken, simulatedTideConfig } from "@/lib/auth/sim/issuer";
import { findSimUser, SIM_CLIENT_ID } from "@/lib/auth/sim/realm";
import { AuthConfigurationError, AuthenticationError, AuthorizationError, requirePrincipal, requireTideRole } from "@/lib/auth/server";
import { TIDE_VAULT_ROLES } from "@/lib/vault/contracts";

const ORIGIN = "http://localhost:3000";
process.env.TIDE_SIM_KEY_FILE = join(mkdtempSync(join(tmpdir(), "tide-sim-")), "key.json");

function user(name: string) {
  const found = findSimUser(name);
  if (!found) throw new Error(`no sim user ${name}`);
  return found;
}

function request(init: { bearer?: string; cookie?: string; method?: string; origin?: string }) {
  const headers = new Headers();
  if (init.bearer) headers.set("authorization", `Bearer ${init.bearer}`);
  if (init.cookie) headers.set("cookie", `kcToken=${init.cookie}`);
  if (init.origin) headers.set("origin", init.origin);
  return new NextRequest(`${ORIGIN}/api/organizations`, { method: init.method ?? "GET", headers });
}

beforeEach(() => {
  process.env.AUTH_MODE = "tidecloak-sim";
  process.env.ALLOW_INSECURE_DEV_AUTH = "true";
  process.env.APP_ORIGIN = ORIGIN;
  delete process.env.TIDE_REQUIRED_ROLE;
});

describe("simulated TideCloak", () => {
  it("issues tokens that Tide's own verifier accepts against the embedded JWKS", async () => {
    const token = await issueSimulatedToken(user("alice"));
    const claims = await verifyTideCloakToken(simulatedTideConfig(), token);
    expect(claims).toMatchObject({ sub: "demo-alice", azp: SIM_CLIENT_ID, iss: `${ORIGIN}/sim-tidecloak/realms/businessvault`, email_verified: true });
    expect(await verifyTideCloakToken(simulatedTideConfig(), token, [TIDE_VAULT_ROLES.encrypt])).toBeTruthy();
  });

  it("builds a principal with realm roles from a verified Bearer token", async () => {
    const principal = await requirePrincipal(request({ bearer: await issueSimulatedToken(user("erin")) }));
    expect(principal).toMatchObject({ subject: "demo-erin", source: "tidecloak-sim", email: "erin@northstar.test", emailVerified: true });
    expect(principal.roles).toEqual(expect.arrayContaining(["_tide_enabled", TIDE_VAULT_ROLES.decrypt]));
    expect(principal.roles).not.toContain(TIDE_VAULT_ROLES.encrypt);
  });

  it("rejects tampered, foreign-key, wrong-issuer and expired tokens", async () => {
    const good = await issueSimulatedToken(user("dave"));
    const [h, p, s] = good.split(".");
    const forged = JSON.parse(Buffer.from(p, "base64url").toString());
    forged.sub = "demo-alice";
    await expect(requirePrincipal(request({ bearer: `${h}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${s}` }))).rejects.toBeInstanceOf(AuthenticationError);

    const foreign = await new SignJWT({ azp: SIM_CLIENT_ID, realm_access: { roles: ["_tide_enabled"] } })
      .setProtectedHeader({ alg: "EdDSA", kid: "tidecloak-sim" }).setIssuer(`${ORIGIN}/sim-tidecloak/realms/businessvault`)
      .setSubject("demo-alice").setIssuedAt().setExpirationTime("10m").sign(generateKeyPairSync("ed25519").privateKey);
    await expect(requirePrincipal(request({ bearer: foreign }))).rejects.toBeInstanceOf(AuthenticationError);

    process.env.APP_ORIGIN = "http://localhost:4000";
    await expect(requirePrincipal(request({ bearer: good }))).rejects.toBeInstanceOf(AuthenticationError);
    process.env.APP_ORIGIN = ORIGIN;

    const expired = await issueSimulatedToken(user("dave"), -60);
    await expect(requirePrincipal(request({ bearer: expired }))).rejects.toBeInstanceOf(AuthenticationError);
    await expect(requirePrincipal(request({}))).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("refuses accounts without the _tide_enabled gate role", async () => {
    await expect(requirePrincipal(request({ bearer: await issueSimulatedToken(user("victor")) }))).rejects.toBeInstanceOf(AuthorizationError);
    process.env.TIDE_REQUIRED_ROLE = "";
    await expect(requirePrincipal(request({ bearer: await issueSimulatedToken(user("victor")) }))).resolves.toMatchObject({ subject: "demo-victor" });
  });

  it("enforces vault roles server-side", async () => {
    const mallory = await requirePrincipal(request({ bearer: await issueSimulatedToken(user("mallory")) }));
    expect(() => requireTideRole(mallory, TIDE_VAULT_ROLES.encrypt)).toThrow(AuthorizationError);
    expect(() => requireTideRole(mallory, TIDE_VAULT_ROLES.decrypt)).toThrow(AuthorizationError);
    const alice = await requirePrincipal(request({ bearer: await issueSimulatedToken(user("alice")) }));
    expect(() => requireTideRole(alice, TIDE_VAULT_ROLES.encrypt)).not.toThrow();
  });

  it("requires a same-origin request for cookie-authenticated mutations", async () => {
    const token = await issueSimulatedToken(user("alice"));
    await expect(requirePrincipal(request({ cookie: token, method: "POST" }))).rejects.toBeInstanceOf(AuthorizationError);
    await expect(requirePrincipal(request({ cookie: token, method: "POST", origin: "https://evil.example" }))).rejects.toBeInstanceOf(AuthorizationError);
    await expect(requirePrincipal(request({ cookie: token, method: "POST", origin: ORIGIN }))).resolves.toMatchObject({ subject: "demo-alice" });
  });

  it("is disabled unless ALLOW_INSECURE_DEV_AUTH=true", async () => {
    const token = await issueSimulatedToken(user("alice"));
    delete process.env.ALLOW_INSECURE_DEV_AUTH;
    await expect(requirePrincipal(request({ bearer: token }))).rejects.toBeInstanceOf(AuthConfigurationError);
  });
});
