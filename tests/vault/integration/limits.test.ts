import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { DEFAULT_MAX_CIPHERTEXT_BYTES, VAULT_RATE_LIMIT_PER_MINUTE } from "@/lib/vault/contracts";
import { addMember, as, commit, createOrg, createUser, docsPath, initBody, initUpload, postToStorage, prisma, sha256, skipIT, type TestUser } from "../helpers/fixtures";

describe.skipIf(skipIT)("server-side limits and integrity", () => {
  let owner: TestUser, org: string;
  // Fresh ADMIN per test so the per-principal rate limit does not interfere.
  beforeAll(async () => { org = await createOrg(await createUser("limown")); });
  beforeEach(async () => { owner = await createUser("lim"); await addMember(org, owner, "ADMIN"); });

  const init = (b: Record<string, unknown>) => as(owner).post(`${docsPath(org)}/upload-init`, b);
  const small = randomBytes(64);

  it("ciphertextSize > 5 MiB → 413", async () => {
    const r = await init(initBody(small, { ciphertextSize: DEFAULT_MAX_CIPHERTEXT_BYTES + 1 }));
    expect(r.status).toBe(413); expect(r.body).toEqual({ error: "payload_too_large" });
  });

  it.each([0, -1, 1.5, "100", null])("ciphertextSize %s → 400", async (v) => {
    const r = await init(initBody(small, { ciphertextSize: v }));
    expect(r.status).toBe(400); expect(r.body).toEqual({ error: "invalid_request" });
  });

  it.each(["text/html", "application/x-msdownload", "image/svg+xml"])("declaredContentType %s → 415", async (t) => {
    const r = await init(initBody(small, { declaredContentType: t }));
    expect(r.status).toBe(415); expect(r.body).toEqual({ error: "unsupported_content_type" });
  });

  it.each(["abc", "Z".repeat(64), sha256(small).toUpperCase().slice(0, 63)])("bad sha %s → 400", async (h) => {
    expect((await init(initBody(small, { ciphertextSha256: h }))).status).toBe(400);
  });

  it.each([{ classification: "TOP_SECRET" }, { encryptionPolicyTag: "other" }, { ciphertextFormat: "plaintext" }, { encryptedName: "not base64 !!" }])(
    "invalid field %o → 400", async (o) => { expect((await init(initBody(small, o))).status).toBe(400); });

  it("unknown body keys → 400", async () => {
    expect((await init(initBody(small, { objectKey: "v1/x", plaintext: "hi" }))).status).toBe(400);
  });

  it("malformed JSON → 400", async () => {
    expect((await as(owner).postRaw(`${docsPath(org)}/upload-init`, "{not json")).status).toBe(400);
  });

  it("JSON body > 16 KiB → 413", async () => {
    const r = await as(owner).postRaw(`${docsPath(org)}/upload-init`, JSON.stringify(initBody(small, { encryptedName: "A".repeat(17 * 1024) })));
    expect(r.status).toBe(413);
  });

  it("uploading more bytes than declared is rejected by storage or by commit (422)", async () => {
    const declared = randomBytes(1024);
    const i = await initUpload(owner, org, declared);
    expect(i.status).toBe(201);
    const s = await postToStorage(i.body.upload, Buffer.concat([declared, randomBytes(4096)]));
    if (s >= 200 && s < 300) expect((await commit(owner, org, i.body.document.id)).status).toBe(422);
    else expect(s === 0 || s >= 400).toBe(true);
  });

  it("hash mismatch at commit → 422 and doc no longer visible", async () => {
    const declared = randomBytes(512);
    const i = await initUpload(owner, org, declared);
    expect(await postToStorage(i.body.upload, randomBytes(512))).toBeLessThan(300);
    const c = await commit(owner, org, i.body.document.id);
    expect(c.status).toBe(422); expect(c.body).toEqual({ error: "integrity_mismatch" });
    const l = await as(owner).get(docsPath(org));
    expect(l.body.documents.map((d: { id: string }) => d.id)).not.toContain(i.body.document.id);
    expect((await as(owner).post(`${docsPath(org)}/${i.body.document.id}/download`, {})).status).not.toBe(200);
  });

  it("commit without uploading the object is rejected", async () => {
    const i = await initUpload(owner, org, randomBytes(32));
    expect([409, 422]).toContain((await commit(owner, org, i.body.document.id)).status);
  });

  it("double commit → 409", async () => {
    const b = randomBytes(256);
    const i = await initUpload(owner, org, b);
    await postToStorage(i.body.upload, b);
    expect((await commit(owner, org, i.body.document.id)).status).toBe(200);
    const again = await commit(owner, org, i.body.document.id);
    expect(again.status).toBe(409); expect(again.body).toEqual({ error: "invalid_state" });
  });

  it("expired pending upload → commit 409", async () => {
    const b = randomBytes(256);
    const i = await initUpload(owner, org, b);
    await postToStorage(i.body.upload, b);
    await prisma.document.update({ where: { id: i.body.document.id }, data: { uploadExpiresAt: new Date(Date.now() - 60_000) } });
    const c = await commit(owner, org, i.body.document.id);
    expect(c.status).toBe(409); expect(c.body).toEqual({ error: "invalid_state" });
  });

  it(`${VAULT_RATE_LIMIT_PER_MINUTE + 1} rapid upload-inits → at least one 429`, async () => {
    const u = await createUser("rate");
    const o = await createOrg(u);
    const statuses: number[] = [];
    for (let n = 0; n <= VAULT_RATE_LIMIT_PER_MINUTE; n++) statuses.push((await initUpload(u, o, randomBytes(16))).status);
    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s !== 201 && s !== 429)).toEqual([]);
  });
});
