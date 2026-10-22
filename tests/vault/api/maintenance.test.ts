import "./db-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DocumentStatus, MembershipRole } from "@prisma/client";
import { db } from "@/lib/db";
import { setObjectStorageForTests, type ObjectStorage } from "@/lib/storage";
import { createMemoryStorage, type MemoryStorage } from "@/lib/storage/memory";
import { maybeSweepExpiredUploads, resetSweepThrottleForTests, sweepExpiredUploads } from "@/lib/vault/server/maintenance";

describe.skipIf(process.env.VAULT_IT !== "1")("pending-upload sweeper", () => {
  let storage: MemoryStorage;
  let orgId = "";
  let userId = "";

  beforeAll(async () => {
    const org = await db.organization.create({ data: { name: `vault-sweep-${randomUUID()}` } });
    const user = await db.user.create({ data: { tideSubject: `vault-sweep-${randomUUID()}`, displayName: "sweeper" } });
    orgId = org.id;
    userId = user.id;
    await db.membership.create({ data: { organizationId: orgId, userId, role: MembershipRole.OWNER } });
  });

  beforeEach(async () => {
    storage = createMemoryStorage();
    setObjectStorageForTests(storage);
    await resetSweepThrottleForTests();
  });

  afterAll(async () => {
    setObjectStorageForTests(null);
    await db.document.deleteMany({ where: { organizationId: orgId } });
    await db.organization.deleteMany({ where: { id: orgId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  async function makeDoc(expiresInMs: number, status: DocumentStatus = DocumentStatus.PENDING_UPLOAD, createdAt = new Date()) {
    const objectKey = `test/${randomUUID()}`;
    storage.putObject(objectKey, new Uint8Array([1, 2, 3]));
    return db.document.create({
      data: {
        organizationId: orgId,
        ownerId: userId,
        objectKey,
        ciphertextFormat: "tide-e2ee-v1",
        encryptionPolicyTag: "vault",
        size: 3,
        hash: "0".repeat(64),
        classification: "CONFIDENTIAL",
        declaredContentType: "application/pdf",
        encryptedName: "ZW5j",
        version: 1,
        status,
        uploadExpiresAt: new Date(Date.now() + expiresInMs),
        createdAt,
      },
    });
  }

  // Scope the sweep to this test's org by sweeping "as of" a time that only our docs predate is impractical
  // with a shared DB, so assertions check our docs specifically.
  it("rejects expired pending docs, deletes objects, audits once", async () => {
    const expired = await makeDoc(-60_000);
    const fresh = await makeDoc(60 * 60_000);
    const result = await sweepExpiredUploads();
    expect(result.swept).toBeGreaterThanOrEqual(1);
    expect((await db.document.findUniqueOrThrow({ where: { id: expired.id } })).status).toBe("REJECTED");
    expect((await db.document.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe("PENDING_UPLOAD");
    expect(storage.has(expired.objectKey)).toBe(false);
    expect(storage.has(fresh.objectKey)).toBe(true);
    const audits = await db.auditEvent.findMany({ where: { target: expired.id, action: "DOCUMENT_UPLOAD_EXPIRED" } });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBeNull();
    expect(Object.keys(audits[0].eventJson as object).sort()).toEqual(["ciphertextFormat", "classification", "documentId", "size"]);
    expect(JSON.stringify(audits[0].eventJson)).not.toContain(expired.objectKey);

    await sweepExpiredUploads();
    expect(await db.auditEvent.count({ where: { target: expired.id, action: "DOCUMENT_UPLOAD_EXPIRED" } })).toBe(1);
  });

  it("does not touch AVAILABLE docs", async () => {
    const available = await makeDoc(-60_000, DocumentStatus.AVAILABLE);
    await sweepExpiredUploads();
    expect((await db.document.findUniqueOrThrow({ where: { id: available.id } })).status).toBe("AVAILABLE");
    expect(storage.has(available.objectKey)).toBe(true);
  });

  it("counts storage errors but still rejects", async () => {
    const failing: ObjectStorage = { ...storage, deleteObject: async () => { throw new Error("boom"); } };
    setObjectStorageForTests(failing);
    const expired = await makeDoc(-60_000);
    const result = await sweepExpiredUploads();
    expect(result.storageErrors).toBeGreaterThanOrEqual(1);
    expect((await db.document.findUniqueOrThrow({ where: { id: expired.id } })).status).toBe("REJECTED");
  });

  it("missing objects are fine", async () => {
    const expired = await makeDoc(-60_000);
    await storage.deleteObject(expired.objectKey);
    const result = await sweepExpiredUploads();
    expect(result.storageErrors).toBe(0);
    expect((await db.document.findUniqueOrThrow({ where: { id: expired.id } })).status).toBe("REJECTED");
  });

  it("F-02: deletes orphaned objects of rejected docs once the policy has expired", async () => {
    const old = await makeDoc(-60_000, DocumentStatus.REJECTED, new Date(Date.now() - 10 * 60_000));
    const recent = await makeDoc(10 * 60_000, DocumentStatus.REJECTED);
    const result = await sweepExpiredUploads();
    expect(result.rejectedCleaned).toBeGreaterThanOrEqual(1);
    expect(storage.has(old.objectKey)).toBe(false);
    expect(storage.has(recent.objectKey)).toBe(true);
    expect((await db.document.findUniqueOrThrow({ where: { id: old.id } })).uploadExpiresAt).toBeNull();
    // Already cleaned: a re-created object is not tracked again (policy is dead, so it cannot be re-created).
    storage.putObject(old.objectKey, new Uint8Array([1]));
    await sweepExpiredUploads();
    expect(storage.has(old.objectKey)).toBe(true);
  });

  it("respects limit", async () => {
    await makeDoc(-60_000);
    await makeDoc(-60_000);
    expect((await sweepExpiredUploads({ limit: 1 })).swept).toBe(1);
  });

  it("concurrent sweeps claim each doc once", async () => {
    const expired = await makeDoc(-60_000);
    await Promise.all([sweepExpiredUploads(), sweepExpiredUploads()]);
    expect(await db.auditEvent.count({ where: { target: expired.id, action: "DOCUMENT_UPLOAD_EXPIRED" } })).toBe(1);
  });

  it("opportunistic trigger is throttled to once per 60s", async () => {
    const t = Date.now();
    expect(maybeSweepExpiredUploads(t)).toBe(true);
    expect(maybeSweepExpiredUploads(t + 59_000)).toBe(false);
    expect(maybeSweepExpiredUploads(t + 60_000)).toBe(true);
    await resetSweepThrottleForTests();
  });
});
