export type Role = "OWNER" | "ADMIN" | "MEMBER" | "AUDITOR";
export type Status = "ACTIVE" | "SUSPENDED" | "REMOVED";
export const ROLES: Role[] = ["OWNER", "ADMIN", "MEMBER", "AUDITOR"];

export function isPrivilegedRole(role: Role) { return role === "OWNER" || role === "ADMIN"; }

/** Mirrors lib/invitations.ts: privileged invites need INVITE_PRIVILEGED_MEMBER, except owner bootstrap while INITIALIZING. */
export function invitationNeedsRequest(role: Role, setupStatus: string, actorRole: Role | null) {
  if (!isPrivilegedRole(role)) return false;
  return !(setupStatus === "INITIALIZING" && actorRole === "OWNER" && role === "OWNER");
}

export type ChangePath = "direct" | "CHANGE_PRIVILEGED_MEMBERSHIP" | "REMOVE_OWNER";

/** Mirrors lib/membership-governance.ts: any change touching OWNER/ADMIN (from or to) requires a governed request. */
export function memberChangePath(current: Role, change: { role?: Role; status?: Status }): ChangePath {
  if (current === "OWNER" && change.status === "REMOVED") return "REMOVE_OWNER";
  const next = change.role ?? current;
  return isPrivilegedRole(current) || isPrivilegedRole(next) ? "CHANGE_PRIVILEGED_MEMBERSHIP" : "direct";
}

export function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function buildPrivilegedInviteRequest(email: string, role: Role, reason: string, key = newIdempotencyKey()) {
  return { operationType: "INVITE_PRIVILEGED_MEMBER", idempotencyKey: key, payload: { email: email.trim().toLowerCase(), role, reason: reason.trim() } };
}

export function buildMemberChangeRequest(memberId: string, userId: string, current: Role, change: { role?: Role; status?: Status }, reason: string, key = newIdempotencyKey()) {
  const path = memberChangePath(current, change);
  if (path === "REMOVE_OWNER") return { path, body: { operationType: "REMOVE_OWNER", idempotencyKey: key, payload: { targetUserId: userId, reason: reason.trim() } } };
  const body = { ...(change.role ? { role: change.role } : {}), ...(change.status ? { status: change.status } : {}), reason: reason.trim() };
  if (path === "direct") return { path, body };
  return { path, body: { operationType: "CHANGE_PRIVILEGED_MEMBERSHIP", idempotencyKey: key, payload: { memberId, ...body } } };
}

export type InvitationRow = { expiresAt: string; acceptedAt: string | null; revokedAt: string | null };
export function invitationStatus(inv: InvitationRow, now = Date.now()) {
  if (inv.revokedAt) return "REVOKED";
  if (inv.acceptedAt) return "ACCEPTED";
  if (new Date(inv.expiresAt).getTime() <= now) return "EXPIRED";
  return "PENDING";
}

export function quorumSummary(activeOwners: number, required: number | null) {
  const req = required ?? 2;
  const healthy = activeOwners >= req + 2 && activeOwners > 3;
  return {
    healthy,
    text: `${activeOwners} active owner${activeOwners === 1 ? "" : "s"}; REMOVE_OWNER needs ${req} approvals` +
      (healthy ? "." : ` and at least ${Math.max(4, req + 2)} active owners, so owner removal is currently blocked.`),
  };
}

export function validReason(reason: string) { const r = reason.trim(); return r.length >= 5 && r.length <= 1000; }

export class ApiError extends Error { constructor(public code: string, public status: number, message: string) { super(message); } }

export async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = typeof data.error === "string" ? data.error : `http_${res.status}`;
    throw new ApiError(code, res.status, typeof data.message === "string" && data.message !== code ? data.message : code.replaceAll("_", " "));
  }
  return data as T;
}
