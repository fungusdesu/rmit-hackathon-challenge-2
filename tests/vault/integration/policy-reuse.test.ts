import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { addMember, as, commit, createOrg, createUser, docsPath, initUpload, postToStorage, sha256, skipIT } from "../helpers/fixtures";

// F-01: the presigned POST policy stays valid for PRESIGNED_UPLOAD_TTL_SECONDS after commit,
// so the uploader can overwrite a committed (AVAILABLE) object with different bytes.
describe.skipIf(skipIT)("presigned POST policy reuse (F-01)", () => {
  it("probe: storage accepts a second POST with the same policy after commit (documents F-01)", async () => {
    const owner = await createUser("reuse");
    const org = await createOrg(owner);
    const bytes = randomBytes(128);
    const init = await initUpload(owner, org, bytes);
    expect(init.status).toBe(201);
    expect(await postToStorage(init.body.upload, bytes)).toBeLessThan(300);
    expect((await commit(owner, org, init.body.document.id)).status).toBe(200);
    const status = await postToStorage(init.body.upload, randomBytes(128));
    // Current behaviour: accepted (2xx). Invert once F-01 is fixed.
    expect(status).toBeGreaterThanOrEqual(200);
    expect(status).toBeLessThan(300);
  });

  // F-01 regression: served bytes must still match the committed hash after a policy replay.
  // Fixed: commit promotes the object to a server-only key.
  it("F-01: committed object cannot be replaced by reusing the upload policy", async () => {
    const owner = await createUser("reuse2");
    const org = await createOrg(owner);
    const reader = await createUser("reuse2r");
    await addMember(org, reader, "ADMIN");
    const bytes = randomBytes(128);
    const init = await initUpload(owner, org, bytes);
    await postToStorage(init.body.upload, bytes);
    const id = init.body.document.id;
    expect((await commit(owner, org, id)).status).toBe(200);
    await postToStorage(init.body.upload, randomBytes(128));
    const dl = await as(reader).post(`${docsPath(org)}/${id}/download`, {});
    const served = new Uint8Array(await (await fetch(dl.body.download.url)).arrayBuffer());
    expect(sha256(served)).toBe(sha256(bytes));
  });

  // F-02: a REJECTED document's policy can re-create its (deleted) object -> orphaned ciphertext.
  it("probe: storage accepts a POST after rejection (documents F-02 orphan)", async () => {
    const owner = await createUser("rej");
    const org = await createOrg(owner);
    const bytes = randomBytes(128);
    const init = await initUpload(owner, org, bytes);
    await postToStorage(init.body.upload, randomBytes(128));
    expect((await commit(owner, org, init.body.document.id)).status).toBe(422);
    const status = await postToStorage(init.body.upload, bytes);
    expect(status).toBeLessThan(300);
  });
});
