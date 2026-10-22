import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { BASE_URL, initBody } from "../helpers/fixtures";

// Run against an app started with AUTH_MODE=tidecloak. Optional VAULT_TIDE_TOKEN (valid access token) and VAULT_TIDE_ORG_ID.
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const forged = `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({ sub: "attacker", exp: Math.floor(Date.now() / 1000) + 3600 })}.${randomBytes(64).toString("base64url")}`;
const unsigned = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub: "attacker" })}.`;
const org = process.env.VAULT_TIDE_ORG_ID ?? "anyorg";
const path = `/api/organizations/${org}/documents`;

const call = (method: string, p: string, token?: string, body?: unknown) =>
  fetch(`${BASE_URL}${p}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { "content-type": "application/json", "x-dev-user-subject": "attacker", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });

describe.skipIf(process.env.VAULT_IT_TIDE !== "1")("tidecloak mode", () => {
  it.each([["no token", undefined], ["forged", forged], ["alg none", unsigned]])("%s → 401 (dev headers ignored)", async (_l, t) => {
    for (const r of [await call("GET", path, t), await call("POST", `${path}/upload-init`, t, initBody(randomBytes(16)))]) {
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ error: "unauthorized" });
    }
  });

  it.skipIf(!process.env.VAULT_TIDE_TOKEN || !process.env.VAULT_TIDE_ORG_ID)("demo-not-e2ee-v1 format rejected → 400", async () => {
    const r = await call("POST", `${path}/upload-init`, process.env.VAULT_TIDE_TOKEN, initBody(randomBytes(16), { ciphertextFormat: "demo-not-e2ee-v1" }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "invalid_request" });
  });
});
