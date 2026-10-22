import "./db-env";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MembershipRole, MembershipStatus } from "@prisma/client";
import type { Principal } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { setObjectStorageForTests } from "@/lib/storage";
import { createMemoryStorage, type MemoryStorage } from "@/lib/storage/memory";
import { VAULT_RATE_LIMIT_PER_MINUTE, VaultError, type UploadInitRequest } from "@/lib/vault/contracts";
import { commitUpload, getDocument, initUpload, issueDownload, listDocuments } from "@/lib/vault/server/documents";
import { resetRateLimitsForTests } from "@/lib/vault/server/rate-limit";
import { resetDownloadMonitorForTests } from "@/lib/vault/server/download-monitor";


function principal(): Principal {
  const subject = `vault-test-${randomUUID()}`;
  return { subject, displayName: subject.slice(0, 20), email: null, source: "development" };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(VaultError);
  expect((error as VaultError).code).toBe(code);
}

function sha(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

describe.skipIf(process.env.VAULT_IT !== "1")("vault documents service", () => {
  let storage: MemoryStorage;
  const orgIds: string[] = [];
  const userIds: string[] = [];
  const p = { owner: principal(), admin: principal(), member: principal(), member2: principal(), auditor: principal(), outsider: principal(), suspended: principal() };
  let orgId = "";
  let otherOrgId = "";

  async function addMember(organizationId: string, who: Principal, role: MembershipRole, status: MembershipStatus = MembershipStatus.ACTIVE) {
    const user = await db.user.upsert({ where: { tideSubject: who.subject }, update: {}, create: { tideSubject: who.subject, displayName: who.displayName } });
    userIds.push(user.id);
    await db.membership.create({ data: { organizationId, userId: user.id, role, status } });
  }

  beforeAll(async () => {
    const org = await db.organization.create({ data: { name: `vault-it-${randomUUID()}` } });
    const other = await db.organization.create({ data: { name: `vault-it-${randomUUID()}` } });
    orgId = org.id;
    otherOrgId = other.id;
    orgIds.push(org.id, other.id);
    await addMember(orgId, p.owner, MembershipRole.OWNER);
    await addMember(orgId, p.admin, MembershipRole.ADMIN);
    await addMember(orgId, p.member, MembershipRole.MEMBER);
    await addMember(orgId, p.member2, MembershipRole.MEMBER);
    await addMember(orgId, p.auditor, MembershipRole.AUDITOR);
    await addMember(orgId, p.suspended, MembershipRole.MEMBER, MembershipStatus.SUSPENDED);
    await addMember(otherOrgId, p.outsider, MembershipRole.OWNER);
  });

  beforeEach(() => {
    storage = createMemoryStorage();
    setObjectStorageForTests(storage);
    resetRateLimitsForTests();
  });

  afterAll(async () => {
    setObjectStorageForTests(null);
    await db.document.deleteMany({ where: { organizationId: { in: orgIds } } });
    await db.organization.deleteMany({ where: { id: { in: orgIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  function request(bytes: Uint8Array, overrides: Partial<UploadInitRequest> = {}): UploadInitRequest {
    return {
      classification: "CONFIDENTIAL",
      declaredContentType: "application/pdf",
      ciphertextSize: bytes.byteLength,
      ciphertextSha256: sha(bytes),
      ciphertextFormat: "tide-e2ee-v1",
      encryptionPolicyTag: "vault",
      encryptedName: "ZW5jcnlwdGVk",
      ...overrides,
    };
  }

  async function uploadAs(who: Principal, bytes = new Uint8Array([1, 2, 3, 4])) {
    const init = await initUpload(orgId, who, request(bytes));
    const doc = await db.document.findUniqueOrThrow({ where: { id: init.document.id } });
    return { init, doc, bytes };
  }

  async function uploadAndCommit(who: Principal) {
    const { init, doc, bytes } = await uploadAs(who);
    storage.putObject(doc.objectKey, bytes, "application/octet-stream");
    return { committed: await commitUpload(orgId, who, init.document.id), doc };
  }

  it("non-member and suspended member get not_found", async () => {
    await expectCode(listDocuments(orgId, p.outsider), "not_found");
    await expectCode(listDocuments(orgId, p.suspended), "not_found");
    await expectCode(initUpload(orgId, p.outsider, request(new Uint8Array([1]))), "not_found");
  });

  it("commit happy path, metadata excludes objectKey, audit avoids secrets", async () => {
    const { committed, doc } = await uploadAndCommit(p.member);
    expect(committed.status).toBe("AVAILABLE");
    expect(committed.committedAt).not.toBeNull();
    expect(Object.keys(committed)).not.toContain("objectKey");
    expect(JSON.stringify(committed)).not.toContain(doc.objectKey);
    const listed = await listDocuments(orgId, p.auditor);
    expect(listed.some((d) => d.id === doc.id)).toBe(true);
    expect(JSON.stringify(listed)).not.toContain(doc.objectKey);
    const audits = await db.auditEvent.findMany({ where: { organizationId: orgId, target: doc.id } });
    expect(audits.map((a) => a.action).sort()).toEqual(["DOCUMENT_COMMITTED", "DOCUMENT_UPLOAD_INITIATED"]);
    for (const a of audits) {
      expect(Object.keys(a.eventJson as object).sort()).toEqual(["ciphertextFormat", "classification", "documentId", "size"]);
    }
  });

  it("init response has no objectKey in document metadata", async () => {
    const { init, doc } = await uploadAs(p.member);
    expect(JSON.stringify(init.document)).not.toContain(doc.objectKey);
    expect(init.document.status).toBe("PENDING_UPLOAD");
  });

  it("pending docs are only visible to the uploader", async () => {
    const { init } = await uploadAs(p.member);
    expect((await listDocuments(orgId, p.member)).some((d) => d.id === init.document.id)).toBe(true);
    expect((await listDocuments(orgId, p.owner)).some((d) => d.id === init.document.id)).toBe(false);
    await expectCode(getDocument(orgId, p.owner, init.document.id), "not_found");
    await expectCode(commitUpload(orgId, p.owner, init.document.id), "not_found");
  });

  it("cross-tenant document id is not_found", async () => {
    const { committed } = await uploadAndCommit(p.owner);
    await expectCode(getDocument(otherOrgId, p.outsider, committed.id), "not_found");
    await expectCode(issueDownload(otherOrgId, p.outsider, committed.id), "not_found");
    await expectCode(getDocument(orgId, p.outsider, committed.id), "not_found");
  });

  it("auditor cannot upload or download", async () => {
    const { committed } = await uploadAndCommit(p.owner);
    await expectCode(initUpload(orgId, p.auditor, request(new Uint8Array([1]))), "forbidden");
    await expectCode(issueDownload(orgId, p.auditor, committed.id), "forbidden");
  });

  it("member cannot download another's doc; owner/admin can", async () => {
    const { committed } = await uploadAndCommit(p.member2);
    await expectCode(issueDownload(orgId, p.member, committed.id), "forbidden");
    expect((await issueDownload(orgId, p.member2, committed.id)).url).toBeTruthy();
    expect((await issueDownload(orgId, p.admin, committed.id)).url).toBeTruthy();
    expect((await issueDownload(orgId, p.owner, committed.id)).url).toBeTruthy();
  });

  it("other committed docs cannot be committed by non-uploader", async () => {
    const { committed } = await uploadAndCommit(p.member2);
    await expectCode(commitUpload(orgId, p.owner, committed.id), "forbidden");
  });

  it("hash mismatch rejects and deletes object", async () => {
    const { init, doc } = await uploadAs(p.member);
    storage.putObject(doc.objectKey, new Uint8Array([9, 9, 9, 9]), "application/octet-stream");
    await expectCode(commitUpload(orgId, p.member, init.document.id), "integrity_mismatch");
    expect((await db.document.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe("REJECTED");
    expect(storage.has(doc.objectKey)).toBe(false);
    await expectCode(getDocument(orgId, p.member, doc.id), "not_found");
    expect(await db.auditEvent.count({ where: { target: doc.id, action: "DOCUMENT_REJECTED" } })).toBe(1);
  });

  it("size mismatch rejects", async () => {
    const { init, doc } = await uploadAs(p.member);
    storage.putObject(doc.objectKey, new Uint8Array([1, 2, 3, 4, 5]), "application/octet-stream");
    await expectCode(commitUpload(orgId, p.member, init.document.id), "integrity_mismatch");
    expect((await db.document.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe("REJECTED");
    expect(storage.has(doc.objectKey)).toBe(false);
  });

  it("missing object is invalid_state", async () => {
    const { init } = await uploadAs(p.member);
    await expectCode(commitUpload(orgId, p.member, init.document.id), "invalid_state");
  });

  it("double commit is invalid_state", async () => {
    const { committed } = await uploadAndCommit(p.member);
    await expectCode(commitUpload(orgId, p.member, committed.id), "invalid_state");
  });

  it("expired pending upload is invalid_state", async () => {
    const { init, doc, bytes } = await uploadAs(p.member);
    storage.putObject(doc.objectKey, bytes, "application/octet-stream");
    await db.document.update({ where: { id: doc.id }, data: { uploadExpiresAt: new Date(Date.now() - 1000) } });
    await expectCode(commitUpload(orgId, p.member, init.document.id), "invalid_state");
  });

  it("download of pending doc is invalid_state", async () => {
    const { init } = await uploadAs(p.member);
    await expectCode(issueDownload(orgId, p.member, init.document.id), "invalid_state");
  });

  it("F-01: commit promotes ciphertext to a new server-only key", async () => {
    const { committed, doc } = await uploadAndCommit(p.member);
    const after = await db.document.findUniqueOrThrow({ where: { id: committed.id } });
    expect(after.objectKey).not.toBe(doc.objectKey);
    expect(storage.has(doc.objectKey)).toBe(false);
    expect(storage.has(after.objectKey)).toBe(true);
    storage.putObject(doc.objectKey, new Uint8Array([7, 7, 7, 7]));
    expect(await storage.getObjectBytes(after.objectKey)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(JSON.stringify(committed)).not.toContain(after.objectKey);
  });

  it("F-01: hash mismatch leaves no promoted copy behind", async () => {
    const { init, doc } = await uploadAs(p.member);
    storage.putObject(doc.objectKey, new Uint8Array([9, 9, 9, 9]), "application/octet-stream");
    await expectCode(commitUpload(orgId, p.member, init.document.id), "integrity_mismatch");
    expect(storage.keys()).toHaveLength(0);
  });

  it("malformed ids are not_found before any DB query", async () => {
    const membershipSpy = vi.spyOn(db.membership, "findFirst");
    const documentSpy = vi.spyOn(db.document, "findFirst");
    try {
      const bad = ["", "a".repeat(65), "../x", "id with space", "x%00", "é"];
      for (const id of bad) {
        await expectCode(listDocuments(id, p.owner), "not_found");
        await expectCode(getDocument(orgId, p.owner, id), "not_found");
        await expectCode(getDocument(id, p.owner, "abc"), "not_found");
        await expectCode(commitUpload(orgId, p.owner, id), "not_found");
        await expectCode(issueDownload(orgId, p.owner, id), "not_found");
        await expectCode(initUpload(id, p.owner, request(new Uint8Array([1]))), "not_found");
      }
      await expectCode(getDocument(orgId, p.owner, 42 as unknown as string), "not_found");
      expect(membershipSpy).not.toHaveBeenCalled();
      expect(documentSpy).not.toHaveBeenCalled();
    } finally {
      membershipSpy.mockRestore();
      documentSpy.mockRestore();
    }
  });

  it("rate limits download", async () => {
    const { committed } = await uploadAndCommit(p.member);
    for (let i = 0; i < VAULT_RATE_LIMIT_PER_MINUTE; i++) await issueDownload(orgId, p.member, committed.id);
    await expectCode(issueDownload(orgId, p.member, committed.id), "rate_limited");
  });

  it("writes one VAULT_DOWNLOAD_ANOMALY per window", async () => {
    resetDownloadMonitorForTests();
    const { committed } = await uploadAndCommit(p.owner);
    for (let i = 0; i < 15; i++) await issueDownload(orgId, p.owner, committed.id);
    const anomalies = await db.auditEvent.findMany({ where: { organizationId: orgId, action: "VAULT_DOWNLOAD_ANOMALY", target: committed.ownerId } });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].eventJson).toEqual({ count: 11, windowSeconds: 600 });
    expect(await db.auditEvent.count({ where: { target: committed.id, action: "DOCUMENT_DOWNLOAD_ISSUED" } })).toBe(15);
  });

  it("rate limits upload-init", async () => {
    const who = p.admin;
    for (let i = 0; i < VAULT_RATE_LIMIT_PER_MINUTE; i++) await initUpload(orgId, who, request(new Uint8Array([i])));
    await expectCode(initUpload(orgId, who, request(new Uint8Array([1]))), "rate_limited");
  });
});
