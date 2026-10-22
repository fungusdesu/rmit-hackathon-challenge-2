import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { PRESIGNED_DOWNLOAD_TTL_SECONDS } from "@/lib/vault/contracts";
import { addMember, as, commit, createOrg, createUser, docsPath, initUpload, postToStorage, skipIT, uploadDoc, type TestUser } from "../helpers/fixtures";

describe.skipIf(skipIT)("authorization matrix", () => {
  let owner: TestUser, admin: TestUser, m1: TestUser, m2: TestUser, auditor: TestUser, org: string, docM1: string, docOwner: string;

  beforeAll(async () => {
    [owner, admin, m1, m2, auditor] = await Promise.all(["owner", "admin", "m1", "m2", "aud"].map((l) => createUser(l)));
    org = await createOrg(owner);
    await addMember(org, admin, "ADMIN");
    await addMember(org, m1, "MEMBER");
    await addMember(org, m2, "MEMBER");
    await addMember(org, auditor, "AUDITOR");
    docM1 = await uploadDoc(m1, org);
    docOwner = await uploadDoc(owner, org);
  });

  const dl = (u: TestUser, id: string) => as(u).post(`${docsPath(org)}/${id}/download`, {});

  it("AUDITOR can list and read metadata", async () => {
    const l = await as(auditor).get(docsPath(org));
    expect(l.status).toBe(200);
    expect(l.body.documents.map((d: { id: string }) => d.id)).toEqual(expect.arrayContaining([docM1, docOwner]));
    expect((await as(auditor).get(`${docsPath(org)}/${docM1}`)).status).toBe(200);
  });

  it("AUDITOR upload-init → 403", async () => {
    const r = await initUpload(auditor, org, randomBytes(64));
    expect(r.status).toBe(403); expect(r.body).toEqual({ error: "forbidden" });
  });

  it("AUDITOR download → 403", async () => {
    const r = await dl(auditor, docM1);
    expect(r.status).toBe(403); expect(r.body).toEqual({ error: "forbidden" });
  });

  it("MEMBER cannot download another member's doc, can download own", async () => {
    const other = await dl(m2, docM1);
    expect(other.status).toBe(403); expect(other.body).toEqual({ error: "forbidden" });
    expect((await dl(m2, docOwner)).status).toBe(403);
    expect((await dl(m1, docM1)).status).toBe(200);
  });

  it("OWNER and ADMIN can download any doc", async () => {
    for (const u of [owner, admin]) for (const d of [docM1, docOwner]) expect((await dl(u, d)).status).toBe(200);
  });

  it("commit by a non-uploader is rejected", async () => {
    const bytes = randomBytes(128);
    const init = await initUpload(m1, org, bytes);
    expect(init.status).toBe(201);
    expect(await postToStorage(init.body.upload, bytes)).toBeLessThan(300);
    for (const u of [m2, owner, admin, auditor]) {
      const r = await commit(u, org, init.body.document.id);
      expect([403, 404]).toContain(r.status);
    }
    expect((await commit(m1, org, init.body.document.id)).status).toBe(200);
  });

  it("other members do not see someone else's PENDING upload", async () => {
    const init = await initUpload(m1, org, randomBytes(64));
    const l = await as(m2).get(docsPath(org));
    expect(l.body.documents.map((d: { id: string }) => d.id)).not.toContain(init.body.document.id);
  });

  it("download URL is short-lived (X-Amz-Expires ≤ 60) and served with no-store", async () => {
    const r = await dl(m1, docM1);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control") ?? "").toContain("no-store");
    const url = new URL(r.body.download.url);
    const exp = Number(url.searchParams.get("X-Amz-Expires"));
    expect(exp).toBeGreaterThan(0);
    expect(exp).toBeLessThanOrEqual(PRESIGNED_DOWNLOAD_TTL_SECONDS);
    expect(new Date(r.body.download.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(61_000);
    // The URL must actually yield the ciphertext right now.
    expect((await fetch(url)).status).toBe(200);
  });
});
