import { MembershipRole, MembershipStatus, Prisma } from "@prisma/client";
import { db } from "./db";
import { appendAudit } from "./audit";
import { GovernanceError } from "./governance-error";
import { serializable } from "./transaction";
import { isPrivileged } from "./invitations";
import type { Principal } from "./auth/types";

export type MemberChange = { role?: MembershipRole; status?: MembershipStatus; reason: string };

export function parseMemberChange(body: unknown): MemberChange {
  if (!body || typeof body !== "object") throw new GovernanceError("invalid_request", 400);
  const value = body as Record<string, unknown>;
  const role = value.role === undefined ? undefined : value.role as MembershipRole;
  const status = value.status === undefined ? undefined : value.status as MembershipStatus;
  if (role !== undefined && !Object.values(MembershipRole).includes(role)) throw new GovernanceError("invalid_role", 400);
  if (status !== undefined && status !== MembershipStatus.ACTIVE && status !== MembershipStatus.SUSPENDED && status !== MembershipStatus.REMOVED) throw new GovernanceError("invalid_status", 400);
  if (role === undefined && status === undefined) throw new GovernanceError("invalid_request", 400);
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (reason.length < 5 || reason.length > 1000) throw new GovernanceError("invalid_reason", 400);
  return { role, status, reason };
}

export async function applyMemberChange(tx: Prisma.TransactionClient, organizationId: string, actorId: string, memberId: string, change: MemberChange, privileged: boolean) {
  const member = await tx.membership.findFirst({ where: { id: memberId, organizationId } });
  if (!member) throw new GovernanceError("not_found", 404);
  if (member.status === MembershipStatus.REMOVED) throw new GovernanceError("removed_membership", 409);
  const nextRole = change.role ?? member.role;
  const nextStatus = change.status ?? member.status;
  if (nextRole === member.role && nextStatus === member.status) throw new GovernanceError("no_change", 409);
  if (nextStatus === MembershipStatus.ACTIVE && member.status !== MembershipStatus.ACTIVE && member.status !== MembershipStatus.SUSPENDED) throw new GovernanceError("invalid_transition", 409);
  if (!privileged && (isPrivileged(member.role) || isPrivileged(nextRole))) throw new GovernanceError("approval_required", 409);
  if (member.role === MembershipRole.OWNER && (nextRole !== MembershipRole.OWNER || nextStatus !== MembershipStatus.ACTIVE)) {
    const owners = await tx.membership.count({ where: { organizationId, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE } });
    if (owners <= 3) throw new GovernanceError("owner_floor", 409);
  }
  const updated = await tx.membership.update({ where: { id: member.id }, data: { role: nextRole, status: nextStatus, version: { increment: 1 } } });
  await appendAudit(tx, organizationId, actorId, "MEMBERSHIP_CHANGED", memberId, { fromRole: member.role, toRole: nextRole, fromStatus: member.status, toStatus: nextStatus, reason: change.reason });
  return updated;
}

export async function changeOrdinaryMember(organizationId: string, memberId: string, principal: Principal, change: MemberChange) {
  return serializable(async (tx) => {
    const actor = await tx.membership.findFirst({ where: { organizationId, status: MembershipStatus.ACTIVE, user: { tideSubject: principal.subject } } });
    if (!actor) throw new GovernanceError("not_found", 404);
    if (!isPrivileged(actor.role)) throw new GovernanceError("forbidden", 403);
    return applyMemberChange(tx, organizationId, actor.userId, memberId, change, false);
  });
}

export async function listPolicies(organizationId: string, principal: Principal) {
  const member = await db.membership.findFirst({ where: { organizationId, status: MembershipStatus.ACTIVE, user: { tideSubject: principal.subject } } });
  if (!member) throw new GovernanceError("not_found", 404);
  return db.policy.findMany({ where: { organizationId, active: true }, orderBy: { operationType: "asc" } });
}
