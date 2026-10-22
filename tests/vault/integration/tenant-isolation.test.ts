import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { addMember, as, commit, createOrg, createUser, docsPath, initBody, skipIT, uploadDoc, type TestUser } from "../helpers/fixtures";

const NF = { error: "not_found" };

describe.skipIf(skipIT)("tenant isolation (404 for non-members / cross-tenant)", () => {
  let ownerA: TestUser, ownerB: TestUser, outsider: TestUser, orgA: string, orgB: string, docA: string;

  beforeAll(async () => {
    [ownerA, ownerB, outsider] = await Promise.all([createUser("ownerA"), createUser("ownerB"), createUser("out")]);
    orgA = await createOrg(ownerA);
    orgB = await createOrg(ownerB);
    docA = await uploadDoc(ownerA, orgA);
  });

  async function expectAllNotFound(user: TestUser, orgId: string, docId: string) {
    const c = as(user), p = docsPath(orgId);
    const results = await Promise.all([
      c.get(p), c.get(`${p}/${docId}`), c.post(`${p}/upload-init`, initBody(randomBytes(32))),
      c.post(`${p}/${docId}/commit`, {}), c.post(`${p}/${docId}/download`, {}),
    ]);
    for (const r of results) { expect(r.status).toBe(404); expect(r.body).toEqual(NF); }
    // Identical bodies across all endpoints.
    expect(new Set(results.map((r) => r.text)).size).toBe(1);
  }

  it("non-member gets identical 404 on list/get/init/commit/download", () => expectAllNotFound(outsider, orgA, docA));

  it("unknown document id is indistinguishable from a foreign one", async () => {
    const r = await as(ownerA).get(`${docsPath(orgA)}/doesnotexist000000000000`);
    expect(r.status).toBe(404); expect(r.body).toEqual(NF);
  });

  it("member of org B using org A's doc id under org B's URL gets 404", async () => {
    const c = as(ownerB), p = docsPath(orgB);
    for (const r of [await c.get(`${p}/${docA}`), await c.post(`${p}/${docA}/download`, {}), await c.post(`${p}/${docA}/commit`, {})]) {
      expect(r.status).toBe(404); expect(r.body).toEqual(NF);
    }
  });

  it("member of org B under org A's URL gets 404", () => expectAllNotFound(ownerB, orgA, docA));

  it.each(["SUSPENDED", "REMOVED", "INVITED"] as const)("%s membership gets 404", async (status) => {
    const u = await createUser(status.toLowerCase());
    await addMember(orgA, u, "ADMIN", status);
    await expectAllNotFound(u, orgA, docA);
  });

  it("pending doc of the owner cannot be committed via another org", async () => {
    const r = await commit(ownerB, orgB, docA);
    expect(r.status).toBe(404);
  });
});
