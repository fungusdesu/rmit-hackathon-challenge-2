import { createHash } from "node:crypto";
import { DocumentStatus, MembershipRole, type Document, type Membership, type User } from "@prisma/client";
import type { Principal } from "@/lib/auth/types";
import { appendAudit } from "@/lib/approvals";
import { db } from "@/lib/db";
import { getMembership, getOrCreateUser } from "@/lib/organizations";
import { getObjectStorage } from "@/lib/storage";
import {
  CIPHERTEXT_OBJECT_CONTENT_TYPE,
  PENDING_UPLOAD_TTL_SECONDS,
  PRESIGNED_DOWNLOAD_TTL_SECONDS,
  PRESIGNED_UPLOAD_TTL_SECONDS,
  VaultError,
  maxCiphertextBytes,
  type AllowedContentType,
  type Classification,
  type CiphertextFormat,
  type DocumentMetadata,
  type UploadInitRequest,
  type UploadInitResponse,
} from "@/lib/vault/contracts";
import { generateObjectKey } from "@/lib/storage/keys";
import { maybeSweepExpiredUploads } from "./maintenance";
import { enforceRateLimit } from "./rate-limit";

type DocumentWithOwner = Document & { owner: Pick<User, "displayName"> };

export function toDocumentMetadata(doc: DocumentWithOwner): DocumentMetadata {
  return {
    id: doc.id,
    organizationId: doc.organizationId,
    ownerId: doc.ownerId,
    ownerDisplayName: doc.owner.displayName,
    classification: doc.classification as Classification,
    declaredContentType: doc.declaredContentType as AllowedContentType,
    ciphertextFormat: doc.ciphertextFormat as CiphertextFormat,
    encryptionPolicyTag: doc.encryptionPolicyTag,
    size: doc.size,
    hash: doc.hash,
    encryptedName: doc.encryptedName,
    version: doc.version,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    committedAt: doc.committedAt ? doc.committedAt.toISOString() : null,
  };
}

function auditPayload(doc: Pick<Document, "id" | "size" | "classification" | "ciphertextFormat">) {
  return { documentId: doc.id, size: doc.size, classification: doc.classification, ciphertextFormat: doc.ciphertextFormat };
}

async function requireMember(organizationId: string, principal: Principal): Promise<Membership> {
  const membership = await getMembership(organizationId, principal);
  if (!membership) throw new VaultError("not_found");
  return membership;
}

const ownerInclude = { owner: { select: { displayName: true } } } as const;

async function findVisible(organizationId: string, membership: Membership, documentId: string): Promise<DocumentWithOwner> {
  if (typeof documentId !== "string" || documentId.length === 0 || documentId.length > 64) throw new VaultError("not_found");
  const doc = await db.document.findFirst({ where: { id: documentId, organizationId }, include: ownerInclude });
  if (!doc) throw new VaultError("not_found");
  if (doc.status === DocumentStatus.REJECTED) throw new VaultError("not_found");
  if (doc.status === DocumentStatus.PENDING_UPLOAD && doc.ownerId !== membership.userId) throw new VaultError("not_found");
  return doc;
}

export async function listDocuments(organizationId: string, principal: Principal): Promise<DocumentMetadata[]> {
  const membership = await requireMember(organizationId, principal);
  const docs = await db.document.findMany({
    where: {
      organizationId,
      OR: [{ status: DocumentStatus.AVAILABLE }, { status: DocumentStatus.PENDING_UPLOAD, ownerId: membership.userId }],
    },
    include: ownerInclude,
    orderBy: { createdAt: "desc" },
  });
  return docs.map(toDocumentMetadata);
}

export async function getDocument(organizationId: string, principal: Principal, documentId: string): Promise<DocumentMetadata> {
  const membership = await requireMember(organizationId, principal);
  return toDocumentMetadata(await findVisible(organizationId, membership, documentId));
}

export async function initUpload(organizationId: string, principal: Principal, input: UploadInitRequest): Promise<UploadInitResponse> {
  const membership = await requireMember(organizationId, principal);
  if (membership.role === MembershipRole.AUDITOR) throw new VaultError("forbidden");
  enforceRateLimit(principal, "upload-init");
  maybeSweepExpiredUploads();
  const user = await getOrCreateUser(principal);
  const objectKey = generateObjectKey();

  const doc = await db.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        organizationId,
        ownerId: user.id,
        objectKey,
        ciphertextFormat: input.ciphertextFormat,
        encryptionPolicyTag: input.encryptionPolicyTag,
        size: input.ciphertextSize,
        hash: input.ciphertextSha256,
        classification: input.classification,
        declaredContentType: input.declaredContentType,
        encryptedName: input.encryptedName,
        version: 1,
        status: DocumentStatus.PENDING_UPLOAD,
        uploadExpiresAt: new Date(Date.now() + PENDING_UPLOAD_TTL_SECONDS * 1000),
      },
      include: ownerInclude,
    });
    await appendAudit(tx, organizationId, user.id, "DOCUMENT_UPLOAD_INITIATED", created.id, auditPayload(created));
    return created;
  });

  const upload = await getObjectStorage().createUploadTarget({
    objectKey,
    maxBytes: input.ciphertextSize,
    contentType: CIPHERTEXT_OBJECT_CONTENT_TYPE,
    expiresInSeconds: PRESIGNED_UPLOAD_TTL_SECONDS,
  });

  return { document: toDocumentMetadata(doc), upload: { url: upload.url, fields: upload.fields, expiresAt: upload.expiresAt.toISOString() } };
}

async function rejectDocument(organizationId: string, actorId: string, doc: Document) {
  const claimed = await db.$transaction(async (tx) => {
    const result = await tx.document.updateMany({
      where: { id: doc.id, organizationId, status: DocumentStatus.PENDING_UPLOAD },
      data: { status: DocumentStatus.REJECTED },
    });
    if (result.count === 1) await appendAudit(tx, organizationId, actorId, "DOCUMENT_REJECTED", doc.id, auditPayload(doc));
    return result.count === 1;
  });
  if (claimed) await getObjectStorage().deleteObject(doc.objectKey);
}

export async function commitUpload(organizationId: string, principal: Principal, documentId: string): Promise<DocumentMetadata> {
  const membership = await requireMember(organizationId, principal);
  const doc = await findVisible(organizationId, membership, documentId);
  if (doc.ownerId !== membership.userId) throw new VaultError("forbidden");
  if (doc.status !== DocumentStatus.PENDING_UPLOAD || !doc.uploadExpiresAt || doc.uploadExpiresAt.getTime() <= Date.now()) {
    throw new VaultError("invalid_state");
  }

  const storage = getObjectStorage();
  const head = await storage.headObject(doc.objectKey);
  if (!head) throw new VaultError("invalid_state");

  let valid = head.size === doc.size && head.size <= maxCiphertextBytes() && head.contentType === CIPHERTEXT_OBJECT_CONTENT_TYPE;
  if (valid) {
    const bytes = await storage.getObjectBytes(doc.objectKey);
    valid = bytes.byteLength === doc.size && createHash("sha256").update(bytes).digest("hex") === doc.hash;
  }
  if (!valid) {
    await rejectDocument(organizationId, membership.userId, doc);
    throw new VaultError("integrity_mismatch");
  }

  const committedAt = new Date();
  const updated = await db.$transaction(async (tx) => {
    const result = await tx.document.updateMany({
      where: { id: doc.id, organizationId, status: DocumentStatus.PENDING_UPLOAD },
      data: { status: DocumentStatus.AVAILABLE, committedAt },
    });
    if (result.count !== 1) throw new VaultError("invalid_state");
    await appendAudit(tx, organizationId, membership.userId, "DOCUMENT_COMMITTED", doc.id, auditPayload(doc));
    return tx.document.findFirstOrThrow({ where: { id: doc.id, organizationId }, include: ownerInclude });
  });
  return toDocumentMetadata(updated);
}

export async function issueDownload(organizationId: string, principal: Principal, documentId: string) {
  const membership = await requireMember(organizationId, principal);
  const doc = await findVisible(organizationId, membership, documentId);
  if (membership.role === MembershipRole.AUDITOR) throw new VaultError("forbidden");
  enforceRateLimit(principal, "download");
  if (membership.role === MembershipRole.MEMBER && doc.ownerId !== membership.userId) throw new VaultError("forbidden");
  if (doc.status !== DocumentStatus.AVAILABLE) throw new VaultError("invalid_state");

  const download = await getObjectStorage().createDownloadUrl(doc.objectKey, PRESIGNED_DOWNLOAD_TTL_SECONDS);
  await db.$transaction((tx) => appendAudit(tx, organizationId, membership.userId, "DOCUMENT_DOWNLOAD_ISSUED", doc.id, auditPayload(doc)));
  return { url: download.url, expiresAt: download.expiresAt.toISOString() };
}
