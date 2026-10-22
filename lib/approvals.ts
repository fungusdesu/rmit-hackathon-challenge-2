import { createHash } from "node:crypto";
import { ApprovalDecision, MembershipRole, MembershipStatus, Prisma, RequestStatus } from "@prisma/client";
import { db } from "./db";
import { appendAudit } from "./audit";
import { GovernanceError } from "./governance-error";
import { serializable } from "./transaction";
import { getMembership } from "./organizations";
import { issueInvitation, parseInvitation } from "./invitations";
import { applyMemberChange, parseMemberChange } from "./membership-governance";
import type { Principal } from "./auth/types";

export const PROTECTED_OPERATIONS = ["REMOVE_OWNER", "INVITE_PRIVILEGED_MEMBER", "CHANGE_PRIVILEGED_MEMBERSHIP", "UPDATE_POLICY"] as const;
export type ProtectedOperation = (typeof PROTECTED_OPERATIONS)[number];
type ActionInput = { operationType: ProtectedOperation; payload: Record<string, unknown>; idempotencyKey: string };

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalize(entry)]));
  return value;
}
export function canonicalJson(value: unknown) { return JSON.stringify(canonicalize(value)); }
export function digestPayload(value: unknown) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }

function reason(value: unknown) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < 5 || result.length > 1000) throw new GovernanceError("invalid_reason", 400);
  return result;
}

export function parseActionInput(body: unknown): ActionInput {
  if (!body || typeof body !== "object") throw new GovernanceError("invalid_request", 400);
  const input = body as Record<string, unknown>;
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) throw new GovernanceError("invalid_idempotency_key", 400);
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) throw new GovernanceError("invalid_payload", 400);
  const raw = input.payload as Record<string, unknown>;
  switch (input.operationType) {
    case "REMOVE_OWNER": {
      const targetUserId = typeof raw.targetUserId === "string" ? raw.targetUserId.trim() : "";
      if (!targetUserId) throw new GovernanceError("invalid_target", 400);
      return { operationType: "REMOVE_OWNER", idempotencyKey, payload: { targetUserId, reason: reason(raw.reason) } };
    }
    case "INVITE_PRIVILEGED_MEMBER": {
      const invitation = parseInvitation(raw);
      if (invitation.role !== MembershipRole.OWNER && invitation.role !== MembershipRole.ADMIN) throw new GovernanceError("invalid_role", 400);
      return { operationType: "INVITE_PRIVILEGED_MEMBER", idempotencyKey, payload: { ...invitation, reason: reason(raw.reason) } };
    }
    case "CHANGE_PRIVILEGED_MEMBERSHIP": {
      const memberId = typeof raw.memberId === "string" ? raw.memberId.trim() : "";
      if (!memberId) throw new GovernanceError("invalid_target", 400);
      const change = parseMemberChange(raw);
      return { operationType: "CHANGE_PRIVILEGED_MEMBERSHIP", idempotencyKey, payload: { memberId, ...(change.role ? { role: change.role } : {}), ...(change.status ? { status: change.status } : {}), reason: change.reason } };
    }
    case "UPDATE_POLICY": {
      const operationType = raw.operationType;
      if (!["REMOVE_OWNER", "INVITE_PRIVILEGED_MEMBER", "CHANGE_PRIVILEGED_MEMBERSHIP"].includes(operationType as string)) throw new GovernanceError("invalid_operation", 400);
      if (!Number.isInteger(raw.requiredApprovals) || (raw.requiredApprovals as number) < 2 || (raw.requiredApprovals as number) > 10) throw new GovernanceError("invalid_quorum", 400);
      if (!Number.isInteger(raw.ttlSeconds) || (raw.ttlSeconds as number) < 300 || (raw.ttlSeconds as number) > 604800) throw new GovernanceError("invalid_ttl", 400);
      if (!Number.isInteger(raw.baseVersion) || (raw.baseVersion as number) < 1) throw new GovernanceError("invalid_base_version", 400);
      return { operationType: "UPDATE_POLICY", idempotencyKey, payload: { operationType, requiredApprovals: raw.requiredApprovals, ttlSeconds: raw.ttlSeconds, baseVersion: raw.baseVersion, reason: reason(raw.reason) } };
    }
    default: throw new GovernanceError("unsupported_operation", 400);
  }
}

function verifiedDigest(request: { canonicalPayload: Prisma.JsonValue; payloadDigest: string }) {
  return digestPayload(request.canonicalPayload) === request.payloadDigest;
}

function requestBindingValid(request: { operationType: string; targetType: string; targetId: string; canonicalPayload: Prisma.JsonValue }) {
  const payload = request.canonicalPayload as Record<string, unknown>;
  switch (request.operationType) {
    case "REMOVE_OWNER": return request.targetType === "USER" && request.targetId === payload.targetUserId;
    case "INVITE_PRIVILEGED_MEMBER": return request.targetType === "EMAIL" && request.targetId === payload.email;
    case "CHANGE_PRIVILEGED_MEMBERSHIP": return request.targetType === "MEMBERSHIP" && request.targetId === payload.memberId;
    case "UPDATE_POLICY": return request.targetType === "POLICY" && request.targetId === payload.operationType;
    default: return false;
  }
}

async function expireIfNeeded(organizationId: string, requestId: string) {
  await serializable(async (tx) => {
    const changed = await tx.actionRequest.updateMany({ where: { id: requestId, organizationId, status: { in: [RequestStatus.PENDING, RequestStatus.AUTHORIZED] }, expiresAt: { lte: new Date() } }, data: { status: RequestStatus.EXPIRED } });
    if (changed.count) await appendAudit(tx, organizationId, null, "ACTION_EXPIRED", requestId, {});
  });
}

export async function createActionRequest(organizationId: string, principal: Principal, input: ActionInput) {
  const digest = digestPayload(input.payload);
  try {
    return await serializable(async (tx) => {
    const member = await tx.membership.findFirst({ where: { organizationId, status: MembershipStatus.ACTIVE, user: { tideSubject: principal.subject } } });
    if (!member) throw new GovernanceError("not_found", 404);
    if (input.operationType === "REMOVE_OWNER") {
      if (member.role !== MembershipRole.OWNER && member.role !== MembershipRole.ADMIN) throw new GovernanceError("forbidden", 403);
    } else if (member.role !== MembershipRole.OWNER) throw new GovernanceError("forbidden", 403);
    const org = await tx.organization.findUnique({ where: { id: organizationId } });
    if (!org || org.setupStatus !== "ACTIVE") throw new GovernanceError("governance_not_active", 409);
    const existing = await tx.actionRequest.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } } });
    if (existing) {
      if (existing.requesterId !== member.userId || existing.operationType !== input.operationType || existing.payloadDigest !== digest) throw new GovernanceError("idempotency_conflict", 409);
      return existing;
    }
    let targetType = "ORGANIZATION";
    let targetId = organizationId;
    if (input.operationType === "REMOVE_OWNER") {
      targetType = "USER";
      targetId = input.payload.targetUserId as string;
      const target = await tx.membership.findFirst({ where: { organizationId, userId: targetId, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE } });
      if (!target || target.userId === member.userId) throw new GovernanceError("invalid_target", 422);
    } else if (input.operationType === "CHANGE_PRIVILEGED_MEMBERSHIP") {
      targetType = "MEMBERSHIP";
      targetId = input.payload.memberId as string;
      const target = await tx.membership.findFirst({ where: { id: targetId, organizationId, status: { not: MembershipStatus.REMOVED } } });
      if (!target || !(target.role === MembershipRole.OWNER || target.role === MembershipRole.ADMIN || input.payload.role === MembershipRole.OWNER || input.payload.role === MembershipRole.ADMIN)) throw new GovernanceError("invalid_target", 422);
      if (target.userId === member.userId) throw new GovernanceError("self_change_forbidden", 403);
    } else if (input.operationType === "INVITE_PRIVILEGED_MEMBER") {
      targetType = "EMAIL";
      targetId = input.payload.email as string;
    } else {
      targetType = "POLICY";
      targetId = input.payload.operationType as string;
      const current = await tx.policy.findFirst({ where: { organizationId, operationType: targetId, active: true }, orderBy: { version: "desc" } });
      if (!current || current.version !== input.payload.baseVersion) throw new GovernanceError("stale_policy", 409);
      const owners = await tx.membership.count({ where: { organizationId, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE } });
      if ((input.payload.requiredApprovals as number) > owners - (targetId === "REMOVE_OWNER" ? 2 : 1)) throw new GovernanceError("quorum_unavailable", 409);
    }
    const policy = await tx.policy.findFirst({ where: { organizationId, operationType: input.operationType, active: true }, orderBy: { version: "desc" } });
    if (!policy) throw new GovernanceError("no_policy", 409);
    const owners = await tx.membership.count({ where: { organizationId, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE } });
    if (owners < policy.requiredApprovals + (member.role === MembershipRole.OWNER ? 1 : 0)) throw new GovernanceError("quorum_unavailable", 409);
    if (input.operationType === "REMOVE_OWNER") {
      if (owners < policy.requiredApprovals + 2 || owners <= 3) throw new GovernanceError("quorum_unavailable", 409);
    } else if (input.operationType === "CHANGE_PRIVILEGED_MEMBERSHIP") {
      const target = await tx.membership.findFirstOrThrow({ where: { id: targetId, organizationId } });
      if (target.role === MembershipRole.OWNER && target.status === MembershipStatus.ACTIVE) {
        if (owners < policy.requiredApprovals + 2) throw new GovernanceError("quorum_unavailable", 409);
      }
    }
    const request = await tx.actionRequest.create({ data: { organizationId, requesterId: member.userId, operationType: input.operationType, targetType, targetId, canonicalPayload: canonicalize(input.payload) as Prisma.InputJsonValue, payloadDigest: digest, policyVersion: policy.version, status: RequestStatus.PENDING, expiresAt: new Date(Date.now() + policy.ttlSeconds * 1000), idempotencyKey: input.idempotencyKey } });
    await appendAudit(tx, organizationId, member.userId, "ACTION_REQUESTED", request.id, { operationType: input.operationType, payloadDigest: digest, policyVersion: policy.version });
    return request;
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const existing = await db.actionRequest.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } } });
    const membership = await getMembership(organizationId, principal);
    if (existing && membership && existing.requesterId === membership.userId && existing.operationType === input.operationType && existing.payloadDigest === digest) return existing;
    throw new GovernanceError("idempotency_conflict", 409);
  }
}

export async function listActionRequests(organizationId: string, principal: Principal) {
  if (!(await getMembership(organizationId, principal))) return null;
  const expired = await db.actionRequest.findMany({ where: { organizationId, status: { in: [RequestStatus.PENDING, RequestStatus.AUTHORIZED] }, expiresAt: { lte: new Date() } }, select: { id: true } });
  for (const item of expired) await expireIfNeeded(organizationId, item.id);
  return db.actionRequest.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, include: { approvals: { include: { approver: { select: { displayName: true, email: true } } } }, requester: { select: { displayName: true, email: true } } } });
}

async function validApprovalCount(tx: Prisma.TransactionClient, request: { id: string; organizationId: string; requesterId: string; operationType: string; targetId: string; payloadDigest: string }, policy: { eligibleRoles: Prisma.JsonValue }) {
  const approvals = await tx.approval.findMany({ where: { requestId: request.id, decision: ApprovalDecision.APPROVED, payloadDigest: request.payloadDigest }, include: { approver: { include: { memberships: { where: { organizationId: request.organizationId, status: MembershipStatus.ACTIVE } } } } } });
  const roles = Array.isArray(policy.eligibleRoles) ? policy.eligibleRoles : [];
  const targetUserId = request.operationType === "REMOVE_OWNER" ? request.targetId : request.operationType === "CHANGE_PRIVILEGED_MEMBERSHIP" ? (await tx.membership.findFirst({ where: { id: request.targetId, organizationId: request.organizationId }, select: { userId: true } }))?.userId : undefined;
  return approvals.filter((approval) => approval.approverId !== request.requesterId && approval.approverId !== targetUserId && approval.approver.memberships.some((membership) => roles.includes(membership.role))).length;
}

export async function recordApproval(organizationId: string, requestId: string, principal: Principal, decision: ApprovalDecision) {
  if (!(await getMembership(organizationId, principal))) throw new GovernanceError("not_found", 404);
  await expireIfNeeded(organizationId, requestId);
  return serializable(async (tx) => {
    const member = await tx.membership.findFirst({ where: { organizationId, status: MembershipStatus.ACTIVE, user: { tideSubject: principal.subject } } });
    if (!member) throw new GovernanceError("not_found", 404);
    const request = await tx.actionRequest.findFirst({ where: { id: requestId, organizationId } });
    if (!request) throw new GovernanceError("not_found", 404);
    if (request.status !== RequestStatus.PENDING || request.expiresAt <= new Date()) throw new GovernanceError("not_pending", 409);
    if (!verifiedDigest(request) || !requestBindingValid(request)) throw new GovernanceError("payload_changed", 409);
    const targetUserId = request.operationType === "REMOVE_OWNER" ? request.targetId : request.operationType === "CHANGE_PRIVILEGED_MEMBERSHIP" ? (await tx.membership.findFirst({ where: { id: request.targetId, organizationId }, select: { userId: true } }))?.userId : undefined;
    if (request.requesterId === member.userId || targetUserId === member.userId) throw new GovernanceError("ineligible_approver", 403);
    const policy = await tx.policy.findUnique({ where: { organizationId_operationType_version: { organizationId, operationType: request.operationType, version: request.policyVersion } } });
    if (!policy || !Array.isArray(policy.eligibleRoles) || !policy.eligibleRoles.includes(member.role)) throw new GovernanceError("ineligible_approver", 403);
    const approval = await tx.approval.create({ data: { requestId, approverId: member.userId, decision, payloadDigest: request.payloadDigest } });
    if (decision === ApprovalDecision.REJECTED) await tx.actionRequest.update({ where: { id: requestId }, data: { status: RequestStatus.REJECTED } });
    else if (await validApprovalCount(tx, request, policy) >= policy.requiredApprovals) await tx.actionRequest.update({ where: { id: requestId }, data: { status: RequestStatus.AUTHORIZED, authorizedAt: new Date() } });
    await appendAudit(tx, organizationId, member.userId, decision === ApprovalDecision.APPROVED ? "ACTION_APPROVED" : "ACTION_REJECTED", requestId, { payloadDigest: request.payloadDigest });
    return approval;
  });
}

export async function cancelActionRequest(organizationId: string, requestId: string, principal: Principal) {
  return serializable(async (tx) => {
    const member = await tx.membership.findFirst({ where: { organizationId, status: MembershipStatus.ACTIVE, user: { tideSubject: principal.subject } } });
    if (!member) throw new GovernanceError("not_found", 404);
    const request = await tx.actionRequest.findFirst({ where: { id: requestId, organizationId } });
    if (!request) throw new GovernanceError("not_found", 404);
    if (request.requesterId !== member.userId) throw new GovernanceError("forbidden", 403);
    if (request.status !== RequestStatus.PENDING && request.status !== RequestStatus.AUTHORIZED) throw new GovernanceError("cannot_cancel", 409);
    const updated = await tx.actionRequest.update({ where: { id: requestId }, data: { status: RequestStatus.CANCELLED } });
    await appendAudit(tx, organizationId, member.userId, "ACTION_CANCELLED", requestId, { payloadDigest: updated.payloadDigest });
    return updated;
  });
}

export async function executeActionRequest(organizationId: string, requestId: string, principal: Principal) {
  if (!(await getMembership(organizationId, principal))) throw new GovernanceError("not_found", 404);
  await expireIfNeeded(organizationId, requestId);
  return serializable(async (tx) => {
    const member = await tx.membership.findFirst({ where: { organizationId, status: MembershipStatus.ACTIVE, user: { tideSubject: principal.subject } } });
    if (!member) throw new GovernanceError("not_found", 404);
    if (member.role !== MembershipRole.OWNER) throw new GovernanceError("forbidden", 403);
    const request = await tx.actionRequest.findFirst({ where: { id: requestId, organizationId } });
    if (!request) throw new GovernanceError("not_found", 404);
    if (request.status !== RequestStatus.AUTHORIZED || request.expiresAt <= new Date()) throw new GovernanceError("not_executable", 409);
    if (!verifiedDigest(request) || !requestBindingValid(request)) throw new GovernanceError("payload_changed", 409);
    const requester = await tx.membership.findFirst({ where: { organizationId, userId: request.requesterId, status: MembershipStatus.ACTIVE } });
    if (!requester || (request.operationType === "REMOVE_OWNER" ? requester.role !== MembershipRole.OWNER && requester.role !== MembershipRole.ADMIN : requester.role !== MembershipRole.OWNER)) throw new GovernanceError("requester_ineligible", 409);
    const policy = await tx.policy.findUnique({ where: { organizationId_operationType_version: { organizationId, operationType: request.operationType, version: request.policyVersion } } });
    if (!policy || !policy.active || await validApprovalCount(tx, request, policy) < policy.requiredApprovals) throw new GovernanceError("quorum_invalid", 409);
    const claimed = await tx.actionRequest.updateMany({ where: { id: requestId, organizationId, status: RequestStatus.AUTHORIZED, expiresAt: { gt: new Date() } }, data: { status: RequestStatus.EXECUTING } });
    if (claimed.count !== 1) throw new GovernanceError("already_claimed", 409);
    const payload = request.canonicalPayload as Record<string, unknown>;
    let invitationToken: string | undefined;
    let failure: GovernanceError | undefined;
    try {
      switch (request.operationType) {
        case "REMOVE_OWNER": {
          const target = await tx.membership.findFirst({ where: { organizationId, userId: payload.targetUserId as string, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE } });
          if (!target) throw new GovernanceError("target_changed", 409);
          const owners = await tx.membership.count({ where: { organizationId, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE } });
          if (owners <= 3) throw new GovernanceError("owner_floor", 409);
          await tx.membership.update({ where: { id: target.id }, data: { status: MembershipStatus.REMOVED, version: { increment: 1 } } });
          await appendAudit(tx, organizationId, member.userId, "MEMBERSHIP_CHANGED", target.id, { fromRole: "OWNER", toStatus: "REMOVED", requestId });
          break;
        }
        case "INVITE_PRIVILEGED_MEMBER": {
          const issued = await issueInvitation(tx, organizationId, member.userId, { email: payload.email as string, role: payload.role as MembershipRole });
          invitationToken = issued.token;
          break;
        }
        case "CHANGE_PRIVILEGED_MEMBERSHIP":
          await applyMemberChange(tx, organizationId, member.userId, payload.memberId as string, { role: payload.role as MembershipRole | undefined, status: payload.status as MembershipStatus | undefined, reason: payload.reason as string }, true);
          break;
        case "UPDATE_POLICY": {
          const operationType = payload.operationType as string;
          const old = await tx.policy.findFirst({ where: { organizationId, operationType, active: true }, orderBy: { version: "desc" } });
          if (!old || old.version !== payload.baseVersion) throw new GovernanceError("stale_policy", 409);
          const owners = await tx.membership.count({ where: { organizationId, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE } });
          if ((payload.requiredApprovals as number) > owners - (operationType === "REMOVE_OWNER" ? 2 : 1)) throw new GovernanceError("quorum_unavailable", 409);
          await tx.policy.update({ where: { id: old.id }, data: { active: false } });
          await tx.policy.create({ data: { organizationId, operationType, requiredApprovals: payload.requiredApprovals as number, ttlSeconds: payload.ttlSeconds as number, eligibleRoles: [MembershipRole.OWNER], forbidSelfApproval: true, version: old.version + 1 } });
          const stale = await tx.actionRequest.findMany({ where: { organizationId, operationType, status: { in: [RequestStatus.DRAFT, RequestStatus.PENDING, RequestStatus.AUTHORIZED] } }, select: { id: true } });
          for (const item of stale) {
            await tx.actionRequest.update({ where: { id: item.id }, data: { status: RequestStatus.CANCELLED } });
            await appendAudit(tx, organizationId, member.userId, "ACTION_CANCELLED_BY_POLICY", item.id, { policyVersion: old.version + 1 });
          }
          await appendAudit(tx, organizationId, member.userId, "POLICY_UPDATED", old.id, { operationType, fromVersion: old.version, toVersion: old.version + 1 });
          break;
        }
        default: throw new GovernanceError("unsupported_operation", 409);
      }
    } catch (error) {
      if (!(error instanceof GovernanceError)) throw error;
      failure = error;
    }
    const now = new Date();
    const execution = await tx.execution.create({ data: { requestId, executorType: "BUSINESSVAULT_APP", status: failure ? "FAILED" : "SUCCEEDED", finishedAt: now, safeErrorCode: failure?.code } });
    await tx.actionRequest.update({ where: { id: requestId }, data: { status: failure ? RequestStatus.FAILED : RequestStatus.EXECUTED, executedAt: failure ? null : now } });
    await appendAudit(tx, organizationId, member.userId, failure ? "ACTION_EXECUTION_FAILED" : "ACTION_EXECUTED", requestId, { operationType: request.operationType, payloadDigest: request.payloadDigest, error: failure?.code ?? null });
    return { execution, invitationToken };
  });
}
