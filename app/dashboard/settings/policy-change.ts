// Pure helpers for proposing governed UPDATE_POLICY requests. Mirrors the server
// rules in lib/approvals.ts (parseActionInput + execution quorum check).
export const GOVERNABLE_OPERATIONS = ["REMOVE_OWNER", "INVITE_PRIVILEGED_MEMBER", "CHANGE_PRIVILEGED_MEMBERSHIP"] as const;

export type PolicyChangeDraft = { operationType: string; requiredApprovals: number; ttlSeconds: number; baseVersion: number; reason: string };
export type PolicyChangeCheck = { errors: string[]; warnings: string[] };

export const MIN_TTL = 300;
export const MAX_TTL = 604800;

/** Owners who can approve once the requester (and, for REMOVE_OWNER, the target) are excluded. */
export function eligibleApprovers(operationType: string, activeOwners: number): number {
  return Math.max(0, activeOwners - (operationType === "REMOVE_OWNER" ? 2 : 1));
}

export function validatePolicyChange(draft: PolicyChangeDraft, activeOwners: number, current?: { requiredApprovals: number; ttlSeconds: number }): PolicyChangeCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!(GOVERNABLE_OPERATIONS as readonly string[]).includes(draft.operationType)) errors.push("Choose a governable operation.");
  const n = draft.requiredApprovals;
  const valid = Number.isInteger(n) && n >= 1;
  const eligible = eligibleApprovers(draft.operationType, activeOwners);
  if (!valid) errors.push("Required approvals must be at least 1.");
  else if (n < 2) errors.push("The server requires at least 2 approvals for protected operations.");
  else if (n > 10) errors.push("Required approvals cannot exceed 10.");
  if (valid && n > activeOwners) errors.push(`Required approvals (${n}) exceed the ${activeOwners} active owner(s).`);
  else if (valid && n >= 2 && n > eligible) warnings.push(`Quorum would be unreachable: only ${eligible} owner(s) can approve once the requester${draft.operationType === "REMOVE_OWNER" ? " and target are" : " is"} excluded. Execution will be refused.`);
  if (valid && n === 1 && activeOwners > 1) warnings.push(`1-of-${activeOwners} means a single approver can authorize this operation.`);
  if (!Number.isInteger(draft.ttlSeconds) || draft.ttlSeconds < MIN_TTL || draft.ttlSeconds > MAX_TTL) errors.push("Approval window must be between 5 minutes and 7 days.");
  if (!Number.isInteger(draft.baseVersion) || draft.baseVersion < 1) errors.push("Current policy version is unknown; reload the page.");
  const reason = draft.reason.trim();
  if (reason.length < 5 || reason.length > 1000) errors.push("Reason must be 5–1000 characters.");
  if (current && current.requiredApprovals === n && current.ttlSeconds === draft.ttlSeconds) errors.push("Proposal is identical to the current policy.");
  return { errors, warnings };
}

export function buildPolicyChangeRequest(draft: PolicyChangeDraft, idempotencyKey: string) {
  return {
    operationType: "UPDATE_POLICY" as const,
    idempotencyKey,
    payload: { operationType: draft.operationType, requiredApprovals: draft.requiredApprovals, ttlSeconds: draft.ttlSeconds, baseVersion: draft.baseVersion, reason: draft.reason.trim() },
  };
}

export function formatTtl(seconds: number): string {
  if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? "" : "s"}`;
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? "" : "s"}`;
  return `${Math.round(seconds / 60)} min`;
}
