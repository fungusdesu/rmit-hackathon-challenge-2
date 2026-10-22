import { createHash, randomBytes } from "node:crypto";
import { MembershipRole, MembershipStatus, Prisma } from "@prisma/client";
import { db } from "./db";
import { appendAudit } from "./audit";
import { GovernanceError } from "./governance-error";
import { serializable } from "./transaction";
import type { Principal } from "./auth/types";

export function parseInvitation(body: unknown) {
  if (!body || typeof body !== "object") throw new GovernanceError("invalid_request", 400);
  const record = body as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new GovernanceError("invalid_email", 400);
  if (!Object.values(MembershipRole).includes(record.role as MembershipRole)) throw new GovernanceError("invalid_role", 400);
  return { email, role: record.role as MembershipRole };
}

export function isPrivileged(role: MembershipRole) {
  return role === MembershipRole.OWNER || role === MembershipRole.ADMIN;
}

export async function issueInvitation(tx: Prisma.TransactionClient, organizationId: string, invitedById: string, input: ReturnType<typeof parseInvitation>) {
  const existingMember = await tx.membership.findFirst({ where: { organizationId, user: { email: { equals: input.email, mode: "insensitive" } }, status: { not: MembershipStatus.REMOVED } } });
  if (existingMember) throw new GovernanceError("already_member", 409);
  const existingInvitation = await tx.invitation.findFirst({ where: { organizationId, email: input.email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
  if (existingInvitation) throw new GovernanceError("invitation_exists", 409);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitation = await tx.invitation.create({ data: { organizationId, invitedById, email: input.email, invitedRole: input.role, tokenHash, expiresAt: new Date(Date.now() + 7 * 86400000) } });
  await appendAudit(tx, organizationId, invitedById, "INVITATION_CREATED", invitation.id, { email: input.email, role: input.role });
  return { invitation: { id: invitation.id, email: invitation.email, invitedRole: invitation.invitedRole, expiresAt: invitation.expiresAt }, token };
}

export async function createInvitation(organizationId: string, principal: Principal, input: ReturnType<typeof parseInvitation>) {
  return serializable(async (tx) => {
    const membership = await tx.membership.findFirst({ where: { organizationId, status: MembershipStatus.ACTIVE, user: { tideSubject: principal.subject } } });
    if (!membership) throw new GovernanceError("not_found", 404);
    if (!isPrivileged(membership.role)) throw new GovernanceError("forbidden", 403);
    const org = await tx.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new GovernanceError("not_found", 404);
    if (isPrivileged(input.role) && !(org.setupStatus === "INITIALIZING" && membership.role === MembershipRole.OWNER && input.role === MembershipRole.OWNER)) {
      throw new GovernanceError("approval_required", 409, "Submit a privileged invitation request");
    }
    return issueInvitation(tx, organizationId, membership.userId, input);
  });
}

export async function listInvitations(organizationId: string, principal: Principal) {
  const membership = await db.membership.findFirst({ where: { organizationId, status: MembershipStatus.ACTIVE, user: { tideSubject: principal.subject } } });
  if (!membership) throw new GovernanceError("not_found", 404);
  if (!isPrivileged(membership.role)) throw new GovernanceError("forbidden", 403);
  return db.invitation.findMany({ where: { organizationId }, select: { id: true, email: true, invitedRole: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true }, orderBy: { createdAt: "desc" } });
}

export async function revokeInvitation(organizationId: string, invitationId: string, principal: Principal) {
  return serializable(async (tx) => {
    const actor = await tx.membership.findFirst({ where: { organizationId, status: MembershipStatus.ACTIVE, user: { tideSubject: principal.subject } } });
    if (!actor) throw new GovernanceError("not_found", 404);
    if (!isPrivileged(actor.role)) throw new GovernanceError("forbidden", 403);
    const updated = await tx.invitation.updateMany({ where: { id: invitationId, organizationId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (updated.count !== 1) throw new GovernanceError("not_found", 404);
    await appendAudit(tx, organizationId, actor.userId, "INVITATION_REVOKED", invitationId, {});
    return { id: invitationId, revoked: true };
  });
}

export async function acceptInvitation(token: string, principal: Principal) {
  if (!principal.email || !principal.emailVerified) throw new GovernanceError("verified_email_required", 403);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new GovernanceError("invalid_token", 400);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return serializable(async (tx) => {
    const invitation = await tx.invitation.findUnique({ where: { tokenHash } });
    if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= new Date()) throw new GovernanceError("invalid_invitation", 404);
    if (invitation.email !== principal.email!.trim().toLowerCase()) throw new GovernanceError("email_mismatch", 403);
    const user = await tx.user.upsert({ where: { tideSubject: principal.subject }, update: { displayName: principal.displayName, email: principal.email }, create: { tideSubject: principal.subject, displayName: principal.displayName, email: principal.email } });
    const prior = await tx.membership.findUnique({ where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } } });
    if (prior) throw new GovernanceError("already_member", 409);
    const consumed = await tx.invitation.updateMany({ where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
    if (consumed.count !== 1) throw new GovernanceError("invalid_invitation", 404);
    const membership = await tx.membership.create({ data: { organizationId: invitation.organizationId, userId: user.id, role: invitation.invitedRole, status: MembershipStatus.ACTIVE, joinedAt: new Date() } });
    await appendAudit(tx, invitation.organizationId, user.id, "INVITATION_ACCEPTED", invitation.id, { role: invitation.invitedRole });
    if (invitation.invitedRole === MembershipRole.OWNER) {
      const owners = await tx.membership.count({ where: { organizationId: invitation.organizationId, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE } });
      if (owners >= 3) {
        const changed = await tx.organization.updateMany({ where: { id: invitation.organizationId, setupStatus: "INITIALIZING" }, data: { setupStatus: "ACTIVE" } });
        if (changed.count) {
          const pending = await tx.invitation.findMany({ where: { organizationId: invitation.organizationId, invitedRole: MembershipRole.OWNER, acceptedAt: null, revokedAt: null }, select: { id: true } });
          for (const item of pending) {
            await tx.invitation.update({ where: { id: item.id }, data: { revokedAt: new Date() } });
            await appendAudit(tx, invitation.organizationId, user.id, "INVITATION_REVOKED_ON_ACTIVATION", item.id, {});
          }
          await appendAudit(tx, invitation.organizationId, user.id, "GOVERNANCE_ACTIVATED", invitation.organizationId, { owners });
        }
      }
    }
    return membership;
  });
}
