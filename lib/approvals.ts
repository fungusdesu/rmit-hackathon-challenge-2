import { createHash, randomUUID } from "node:crypto";
import { ApprovalDecision, MembershipRole, MembershipStatus, Prisma, RequestStatus } from "@prisma/client";
import { db } from "./db";
import type { Principal } from "./auth/types";
import { getMembership, getOrCreateUser } from "./organizations";

export const PROTECTED_OPERATIONS = ["REMOVE_OWNER"] as const;
export type ProtectedOperation = (typeof PROTECTED_OPERATIONS)[number];

type OwnerRemovalPayload = { targetUserId: string; reason: string };

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function digestPayload(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function safeReason(value: unknown) {
  if (typeof value !== "string" || value.trim().length < 5 || value.trim().length > 1000) {
    throw new Error("A reason between 5 and 1000 characters is required");
  }
  return value.trim();
}

export function parseActionInput(body: unknown): { operationType: ProtectedOperation; payload: OwnerRemovalPayload; idempotencyKey: string } {
  if (!body || typeof body !== "object") throw new Error("Request body must be an object");
  const record = body as Record<string, unknown>;
  if (record.operationType !== "REMOVE_OWNER") throw new Error("Only REMOVE_OWNER is currently supported");
  const payload = record.payload;
  if (!payload || typeof payload !== "object") throw new Error("A request payload is required");
  const payloadRecord = payload as Record<string, unknown>;
  if (typeof payloadRecord.targetUserId !== "string" || !payloadRecord.targetUserId.trim()) {
    throw new Error("payload.targetUserId is required");
  }
  const idempotencyKey = typeof record.idempotencyKey === "string" ? record.idempotencyKey.trim() : "";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) throw new Error("idempotencyKey must be 8-128 characters");
  return {
    operationType: "REMOVE_OWNER",
    payload: { targetUserId: payloadRecord.targetUserId, reason: safeReason(payloadRecord.reason) },
    idempotencyKey,
  };
}

export async function appendAudit(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorId: string | null,
  action: string,
  target: string,
  eventJson: Prisma.InputJsonValue,
) {
  const previous = await tx.auditEvent.findFirst({ where: { organizationId }, orderBy: { occurredAt: "desc" }, select: { eventHash: true } });
  const occurredAt = new Date();
  const eventHash = createHash("sha256")
    .update(JSON.stringify({ organizationId, actorId, action, target, eventJson, occurredAt: occurredAt.toISOString(), previous: previous?.eventHash ?? null }))
    .digest("hex");
  return tx.auditEvent.create({ data: { organizationId, actorId, action, target, correlationId: randomUUID(), eventJson, occurredAt, previousEventHash: previous?.eventHash, eventHash } });
}

async function getRequestForMember(organizationId: string, requestId: string, principal: Principal) {
  const membership = await getMembership(organizationId, principal);
  if (!membership) return null;
  const request = await db.actionRequest.findFirst({ where: { id: requestId, organizationId }, include: { approvals: true, requester: true } });
  if (!request) return null;
  return { membership, request };
}

export async function createActionRequest(organizationId: string, principal: Principal, input: ReturnType<typeof parseActionInput>) {
  const membership = await getMembership(organizationId, principal);
  if (!membership || (membership.role !== MembershipRole.OWNER && membership.role !== MembershipRole.ADMIN)) throw new Error("forbidden");
  const requester = await getOrCreateUser(principal);
  const target = await db.membership.findFirst({ where: { organizationId, userId: input.payload.targetUserId, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE }, include: { user: true } });
  if (!target) throw new Error("Target active owner was not found");
  if (target.userId === requester.id) throw new Error("You cannot request your own owner removal");
  const policy = await db.policy.findFirst({ where: { organizationId, operationType: input.operationType, active: true }, orderBy: { version: "desc" } });
  if (!policy) throw new Error("No active policy exists for this operation");
  const canonicalPayload = canonicalize(input.payload) as Prisma.InputJsonValue;
  const payloadDigest = digestPayload(input.payload);
  const expiresAt = new Date(Date.now() + policy.ttlSeconds * 1000);

  return db.$transaction(async (tx) => {
    const request = await tx.actionRequest.create({ data: { organizationId, requesterId: requester.id, operationType: input.operationType, targetType: "USER", targetId: target.userId, canonicalPayload, payloadDigest, policyVersion: policy.version, status: RequestStatus.PENDING, expiresAt, idempotencyKey: input.idempotencyKey } });
    await appendAudit(tx, organizationId, requester.id, "ACTION_REQUESTED", request.id, { operationType: input.operationType, payloadDigest, policyVersion: policy.version });
    return request;
  });
}

export async function listActionRequests(organizationId: string, principal: Principal) {
  const membership = await getMembership(organizationId, principal);
  if (!membership) return null;
  return db.actionRequest.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, include: { approvals: { include: { approver: { select: { displayName: true, email: true } } } }, requester: { select: { displayName: true, email: true } } } });
}

export async function recordApproval(organizationId: string, requestId: string, principal: Principal, decision: ApprovalDecision) {
  const found = await getRequestForMember(organizationId, requestId, principal);
  if (!found) throw new Error("not_found");
  const { membership, request } = found;
  if (request.status !== RequestStatus.PENDING) throw new Error("Request is not pending");
  if (request.expiresAt <= new Date()) throw new Error("Request has expired");
  if (request.requesterId === membership.userId) throw new Error("Requester cannot approve their own request");
  const policy = await db.policy.findUnique({ where: { organizationId_operationType_version: { organizationId, operationType: request.operationType, version: request.policyVersion } } });
  if (!policy || !Array.isArray(policy.eligibleRoles) || !policy.eligibleRoles.includes(membership.role)) throw new Error("Approver is not eligible for this policy");
  const approver = await getOrCreateUser(principal);

  return db.$transaction(async (tx) => {
    const fresh = await tx.actionRequest.findUnique({ where: { id: requestId }, include: { approvals: true } });
    if (!fresh || fresh.status !== RequestStatus.PENDING || fresh.payloadDigest !== request.payloadDigest) throw new Error("Request changed or is no longer pending");
    const approval = await tx.approval.create({ data: { requestId, approverId: approver.id, decision, payloadDigest: request.payloadDigest } });
    if (decision === ApprovalDecision.REJECTED) {
      await tx.actionRequest.update({ where: { id: requestId }, data: { status: RequestStatus.REJECTED } });
    } else {
      const approvals = fresh.approvals.filter((item) => item.decision === ApprovalDecision.APPROVED).length + 1;
      if (approvals >= policy.requiredApprovals) await tx.actionRequest.update({ where: { id: requestId }, data: { status: RequestStatus.AUTHORIZED, authorizedAt: new Date() } });
    }
    await appendAudit(tx, organizationId, approver.id, decision === ApprovalDecision.APPROVED ? "ACTION_APPROVED" : "ACTION_REJECTED", requestId, { payloadDigest: request.payloadDigest });
    return approval;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelActionRequest(organizationId: string, requestId: string, principal: Principal) {
  const found = await getRequestForMember(organizationId, requestId, principal);
  if (!found) throw new Error("not_found");
  if (found.request.requesterId !== found.membership.userId) throw new Error("forbidden");
  if (found.request.status !== RequestStatus.DRAFT && found.request.status !== RequestStatus.PENDING) throw new Error("Request cannot be cancelled");
  const requester = await getOrCreateUser(principal);
  return db.$transaction(async (tx) => {
    const updated = await tx.actionRequest.update({ where: { id: requestId }, data: { status: RequestStatus.CANCELLED } });
    await appendAudit(tx, organizationId, requester.id, "ACTION_CANCELLED", requestId, { payloadDigest: updated.payloadDigest });
    return updated;
  });
}

export async function executeActionRequest(organizationId: string, requestId: string, principal: Principal) {
  const found = await getRequestForMember(organizationId, requestId, principal);
  if (!found) throw new Error("not_found");
  if (found.request.status !== RequestStatus.AUTHORIZED) throw new Error("Request is not authorized");
  if (found.request.expiresAt <= new Date()) throw new Error("Request has expired");
  const executor = await getOrCreateUser(principal);
  return db.$transaction(async (tx) => {
    const claimed = await tx.actionRequest.updateMany({ where: { id: requestId, organizationId, status: RequestStatus.AUTHORIZED, expiresAt: { gt: new Date() } }, data: { status: RequestStatus.EXECUTING } });
    if (claimed.count !== 1) throw new Error("Request was already claimed or is no longer executable");
    const targetUserId = (found.request.canonicalPayload as OwnerRemovalPayload).targetUserId;
    const target = await tx.membership.findFirst({ where: { organizationId, userId: targetUserId, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE } });
    if (!target) throw new Error("Target owner is no longer active");
    const owners = await tx.membership.count({ where: { organizationId, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE } });
    if (owners <= 2) throw new Error("Cannot remove an owner while two or fewer active owners remain");
    await tx.membership.update({ where: { id: target.id }, data: { status: MembershipStatus.REMOVED, version: { increment: 1 } } });
    const execution = await tx.execution.create({ data: { requestId, executorType: "BUSINESSVAULT_APP", status: "SUCCEEDED", finishedAt: new Date() } });
    await tx.actionRequest.update({ where: { id: requestId }, data: { status: RequestStatus.EXECUTED, executedAt: new Date() } });
    await appendAudit(tx, organizationId, executor.id, "ACTION_EXECUTED", requestId, { operationType: found.request.operationType, payloadDigest: found.request.payloadDigest });
    return execution;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
