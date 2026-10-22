-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING_UPLOAD', 'AVAILABLE', 'REJECTED');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "committedAt" TIMESTAMP(3),
ADD COLUMN     "declaredContentType" TEXT NOT NULL DEFAULT 'application/octet-stream',
ADD COLUMN     "encryptedName" TEXT,
ADD COLUMN     "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
ADD COLUMN     "uploadExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Document_organizationId_status_createdAt_idx" ON "Document"("organizationId", "status", "createdAt");

