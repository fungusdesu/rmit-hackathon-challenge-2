-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "adminContacts" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "businessOwner" TEXT,
ADD COLUMN     "criticality" TEXT NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "custodians" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "recoveryPlan" TEXT,
ADD COLUMN     "reviewDate" TIMESTAMP(3);

