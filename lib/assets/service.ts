import { MembershipRole, Prisma } from "@prisma/client";
import type { Principal } from "@/lib/auth/types";
import { appendAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getMembership } from "@/lib/organizations";
import { AssetError, isReviewOverdue, parseAssetCreate, parseAssetUpdate } from "./validation";

const WRITE_ROLES: MembershipRole[] = [MembershipRole.OWNER, MembershipRole.ADMIN];

async function requireMember(organizationId: string, principal: Principal) {
  const membership = await getMembership(organizationId, principal);
  if (!membership) throw new AssetError("not_found");
  return membership;
}

function present<T extends { reviewDate: Date | null }>(asset: T) {
  return { ...asset, reviewOverdue: isReviewOverdue(asset.reviewDate) };
}

export async function listAssets(organizationId: string, principal: Principal) {
  await requireMember(organizationId, principal);
  const assets = await db.asset.findMany({ where: { organizationId }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  return assets.map(present);
}

export async function getAsset(organizationId: string, assetId: string, principal: Principal) {
  await requireMember(organizationId, principal);
  const asset = await db.asset.findFirst({ where: { id: assetId, organizationId } });
  if (!asset) throw new AssetError("not_found");
  return present(asset);
}

export async function createAsset(organizationId: string, principal: Principal, body: unknown) {
  const membership = await requireMember(organizationId, principal);
  if (!WRITE_ROLES.includes(membership.role)) throw new AssetError("forbidden");
  const input = parseAssetCreate(body);
  const asset = await db.$transaction(async tx => {
    const created = await tx.asset.create({ data: { ...input, organizationId } });
    await appendAudit(tx, organizationId, membership.userId, "ASSET_CREATED", created.id, { assetId: created.id, organizationId, fields: Object.keys(input).sort() });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return present(asset);
}

export async function updateAsset(organizationId: string, assetId: string, principal: Principal, body: unknown) {
  const membership = await requireMember(organizationId, principal);
  if (!WRITE_ROLES.includes(membership.role)) throw new AssetError("forbidden");
  const input = parseAssetUpdate(body);
  const asset = await db.$transaction(async tx => {
    const existing = await tx.asset.findFirst({ where: { id: assetId, organizationId } });
    if (!existing) throw new AssetError("not_found");
    const updated = await tx.asset.update({ where: { id: existing.id }, data: input });
    await appendAudit(tx, organizationId, membership.userId, "ASSET_UPDATED", existing.id, { assetId: existing.id, organizationId, changedFields: Object.keys(input).sort() });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return present(asset);
}

export async function deleteAsset(organizationId: string, assetId: string, principal: Principal) {
  const membership = await requireMember(organizationId, principal);
  if (membership.role !== MembershipRole.OWNER) throw new AssetError("forbidden");
  await db.$transaction(async tx => {
    const existing = await tx.asset.findFirst({ where: { id: assetId, organizationId } });
    if (!existing) throw new AssetError("not_found");
    if (existing.criticality === "CRITICAL") throw new AssetError("critical_asset_requires_quorum");
    await tx.asset.delete({ where: { id: existing.id } });
    await appendAudit(tx, organizationId, membership.userId, "ASSET_DELETED", existing.id, { assetId: existing.id, organizationId });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
