import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { verifyTideCloakToken } from "@tidecloak/verify";

const issuer = "https://issuer.example/realms/businessvault";
const clientId = "businessvault-client";
const primaryKeys = generateKeyPairSync("ed25519");
const otherKeys = generateKeyPairSync("ed25519");
const publicJwk = primaryKeys.publicKey.export({ format: "jwk" });
const config = {
  realm: "businessvault",
  "auth-server-url": "https://issuer.example",
  resource: clientId,
  "public-client": true,
  tokenSignatureAlgorithms: ["EdDSA"],
  jwk: { keys: [{ ...publicJwk, kid: "test-key", alg: "EdDSA", use: "sig" }] },
};

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function token(overrides = {}, privateKey = primaryKeys.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "EdDSA", typ: "JWT", kid: "test-key" });
  const payload = encode({ iss: issuer, sub: "user-123", azp: clientId, iat: now, exp: now + 300, ...overrides });
  const input = `${header}.${payload}`;
  return `${input}.${sign(null, Buffer.from(input), privateKey).toString("base64url")}`;
}

test("accepts a correctly signed Tide access token", async () => {
  const payload = await verifyTideCloakToken(config, token());
  assert.equal(payload?.sub, "user-123");
});

test("rejects a token with the wrong issuer", async () => {
  assert.equal(await verifyTideCloakToken(config, token({ iss: "https://attacker.example/realms/businessvault" })), null);
});

test("rejects a token for a different client", async () => {
  assert.equal(await verifyTideCloakToken(config, token({ azp: "other-client" })), null);
});

test("rejects an expired token", async () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal(await verifyTideCloakToken(config, token({ iat: now - 600, exp: now - 300 })), null);
});

test("rejects a token with an invalid signature", async () => {
  assert.equal(await verifyTideCloakToken(config, token({}, otherKeys.privateKey)), null);
});

test("rejects a malformed token", async () => {
  assert.equal(await verifyTideCloakToken(config, "not-a-jwt"), null);
});
