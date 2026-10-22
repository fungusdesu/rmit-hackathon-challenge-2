import { DocumentStatus } from "@prisma/client";
import { appendAudit } from "@/lib/approvals";
import { db } from "@/lib/db";
import { getObjectStorage } from "@/lib/storage";

import { PRESIGNED_UPLOAD_TTL_SECONDS } from "@/lib/vault/contracts";

export type SweepResult = { swept: number; storageErrors: number; rejectedCleaned: number };

// Rejects PENDING_UPLOAD documents whose upload window has passed and removes their objects.
// Each document is claimed atomically, so concurrent sweepers never double-process one.
export async function sweepExpiredUploads({ now = new Date(), limit = 100 }: { now?: Date; limit?: number } = {}): Promise<SweepResult> {
  const expired = await db.document.findMany({
    where: { status: DocumentStatus.PENDING_UPLOAD, uploadExpiresAt: { lt: now } },
    orderBy: { uploadExpiresAt: "asc" },
    take: limit,
  });
  let swept = 0;
  let storageErrors = 0;
  for (const doc of expired) {
    const claimed = await db.$transaction(async (tx) => {
      const result = await tx.document.updateMany({
        where: { id: doc.id, status: DocumentStatus.PENDING_UPLOAD },
        data: { status: DocumentStatus.REJECTED },
      });
      if (result.count !== 1) return false;
      await appendAudit(tx, doc.organizationId, null, "DOCUMENT_UPLOAD_EXPIRED", doc.id, {
        documentId: doc.id,
        size: doc.size,
        classification: doc.classification,
        ciphertextFormat: doc.ciphertextFormat,
      });
      return true;
    });
    if (!claimed) continue;
    swept += 1;
    try {
      // Deleting a missing object is a no-op in S3 and in memory storage.
      await getObjectStorage().deleteObject(doc.objectKey);
    } catch {
      storageErrors += 1;
    }
  }

  // F-02: after an integrity reject the still-valid upload policy can re-create the object (orphan).
  // Once the policy has certainly expired, delete the key one final time and clear uploadExpiresAt
  // as the "cleaned" marker so each rejected doc is handled once (retried on storage error).
  const policyDeadBefore = new Date(now.getTime() - (PRESIGNED_UPLOAD_TTL_SECONDS + POLICY_SKEW_SECONDS) * 1000);
  const rejected = await db.document.findMany({
    where: { status: DocumentStatus.REJECTED, uploadExpiresAt: { not: null }, createdAt: { lt: policyDeadBefore } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, objectKey: true },
  });
  let rejectedCleaned = 0;
  for (const doc of rejected) {
    try {
      await getObjectStorage().deleteObject(doc.objectKey);
    } catch {
      storageErrors += 1;
      continue;
    }
    await db.document.updateMany({ where: { id: doc.id, status: DocumentStatus.REJECTED }, data: { uploadExpiresAt: null } });
    rejectedCleaned += 1;
  }
  return { swept, storageErrors, rejectedCleaned };
}

const POLICY_SKEW_SECONDS = 60;

const OPPORTUNISTIC_INTERVAL_MS = 60_000;
let lastOpportunisticSweep = 0;
let running: Promise<unknown> | null = null;

// Fire-and-forget; never throws and starts at most once per interval per process.
export function maybeSweepExpiredUploads(now = Date.now()): boolean {
  if (now - lastOpportunisticSweep < OPPORTUNISTIC_INTERVAL_MS) return false;
  lastOpportunisticSweep = now;
  try {
    running = sweepExpiredUploads().catch(() => undefined);
  } catch {
    running = null;
  }
  return true;
}

export async function resetSweepThrottleForTests() {
  await running;
  running = null;
  lastOpportunisticSweep = 0;
}
