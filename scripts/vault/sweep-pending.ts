// Expired pending-upload sweeper: node --experimental-strip-types scripts/vault/sweep-pending.ts [--limit N]
// Mirrors lib/vault/server/maintenance.ts (kept standalone because path aliases do not resolve under strip-types).
// Prints only counts. Exit 0 on success, 2 on error.
import { createHash, randomUUID } from "node:crypto";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

// Same key ordering as lib/audit.ts so hashVersion 2 rows verify (path aliases don't resolve under strip-types).
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalize(entry)]));
  return value;
}

const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 100;
if (!Number.isSafeInteger(limit) || limit < 1) {
  console.error("usage: sweep-pending.ts [--limit N]");
  process.exit(2);
}

const env = process.env;
const db = new PrismaClient();
const s3 =
  env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
    ? new S3Client({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION || "us-east-1",
        credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
        forcePathStyle: true,
      })
    : null;

async function main() {
  const now = new Date();
  const expired = await db.document.findMany({
    where: { status: "PENDING_UPLOAD", uploadExpiresAt: { lt: now } },
    orderBy: { uploadExpiresAt: "asc" },
    take: limit,
  });
  let swept = 0;
  let storageErrors = 0;
  for (const doc of expired) {
    const claimed = await db.$transaction(async (tx) => {
      const result = await tx.document.updateMany({ where: { id: doc.id, status: "PENDING_UPLOAD" }, data: { status: "REJECTED" } });
      if (result.count !== 1) return false;
      const organizationId = doc.organizationId;
      const action = "DOCUMENT_UPLOAD_EXPIRED";
      const target = doc.id;
      const actorId = null;
      const eventJson = { documentId: doc.id, size: doc.size, classification: doc.classification, ciphertextFormat: doc.ciphertextFormat };
      // Mirrors lib/audit.ts appendAudit (hashVersion 2): org row lock, ordered chain head, monotonic time, canonical hash.
      await tx.$executeRaw`UPDATE "Organization" SET "updatedAt" = "updatedAt" WHERE id = ${organizationId}`;
      const previous = await tx.auditEvent.findFirst({ where: { organizationId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], select: { eventHash: true, occurredAt: true } });
      const occurredAt = new Date(Math.max(Date.now(), previous ? previous.occurredAt.getTime() + 1 : 0));
      const eventHash = createHash("sha256")
        .update(JSON.stringify(canonicalize({ organizationId, actorId, action, target, eventJson, occurredAt: occurredAt.toISOString(), previous: previous?.eventHash ?? null })))
        .digest("hex");
      await tx.auditEvent.create({
        data: { organizationId, actorId, action, target, correlationId: randomUUID(), eventJson, occurredAt, previousEventHash: previous?.eventHash, eventHash, hashVersion: 2 },
      });
      return true;
    });
    if (!claimed) continue;
    swept += 1;
    try {
      if (!s3) throw new Error("storage not configured");
      await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: doc.objectKey }));
    } catch {
      storageErrors += 1;
    }
  }
  // F-02: final delete of rejected docs' upload keys once the presigned policy (120 s + 60 s skew) is dead.
  const policyDeadBefore = new Date(now.getTime() - 180_000);
  const rejected = await db.document.findMany({
    where: { status: "REJECTED", uploadExpiresAt: { not: null }, createdAt: { lt: policyDeadBefore } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, objectKey: true },
  });
  let rejectedCleaned = 0;
  for (const doc of rejected) {
    try {
      if (!s3) throw new Error("storage not configured");
      await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: doc.objectKey }));
    } catch {
      storageErrors += 1;
      continue;
    }
    await db.document.updateMany({ where: { id: doc.id, status: "REJECTED" }, data: { uploadExpiresAt: null } });
    rejectedCleaned += 1;
  }
  console.log(`swept=${swept} rejectedCleaned=${rejectedCleaned} storageErrors=${storageErrors}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async () => {
    console.error("sweep failed");
    await db.$disconnect();
    process.exit(2);
  });
