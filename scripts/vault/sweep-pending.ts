// Expired pending-upload sweeper: node --experimental-strip-types scripts/vault/sweep-pending.ts [--limit N]
// Mirrors lib/vault/server/maintenance.ts (kept standalone because path aliases do not resolve under strip-types).
// Prints only counts. Exit 0 on success, 2 on error.
import { createHash, randomUUID } from "node:crypto";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

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
      const previous = await tx.auditEvent.findFirst({ where: { organizationId }, orderBy: { occurredAt: "desc" }, select: { eventHash: true } });
      const occurredAt = new Date();
      const eventHash = createHash("sha256")
        .update(JSON.stringify({ organizationId, actorId, action, target, eventJson, occurredAt: occurredAt.toISOString(), previous: previous?.eventHash ?? null }))
        .digest("hex");
      await tx.auditEvent.create({
        data: { organizationId, actorId, action, target, correlationId: randomUUID(), eventJson, occurredAt, previousEventHash: previous?.eventHash, eventHash },
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
  console.log(`swept=${swept} storageErrors=${storageErrors}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async () => {
    console.error("sweep failed");
    await db.$disconnect();
    process.exit(2);
  });
