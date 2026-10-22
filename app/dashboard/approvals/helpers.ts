export const OPERATIONS = ["REMOVE_OWNER", "INVITE_PRIVILEGED_MEMBER", "CHANGE_PRIVILEGED_MEMBERSHIP", "UPDATE_POLICY"] as const;
export type Operation = (typeof OPERATIONS)[number];

export const OPERATION_LABELS: Record<string, string> = {
  REMOVE_OWNER: "Remove owner",
  INVITE_PRIVILEGED_MEMBER: "Invite privileged member",
  CHANGE_PRIVILEGED_MEMBERSHIP: "Change privileged membership",
  UPDATE_POLICY: "Update approval policy",
};

export function operationLabel(op: string) { return OPERATION_LABELS[op] ?? op; }

export type FormFields = {
  targetUserId?: string; email?: string; role?: string; memberId?: string; status?: string;
  policyOperation?: string; requiredApprovals?: string; ttlSeconds?: string; baseVersion?: string; reason?: string;
};

/** Builds the exact payload shape `parseActionInput` (lib/approvals.ts) expects. */
export function buildPayload(op: Operation, f: FormFields): Record<string, unknown> {
  const reason = (f.reason ?? "").trim();
  switch (op) {
    case "REMOVE_OWNER": return { targetUserId: (f.targetUserId ?? "").trim(), reason };
    case "INVITE_PRIVILEGED_MEMBER": return { email: (f.email ?? "").trim().toLowerCase(), role: f.role || "ADMIN", reason };
    case "CHANGE_PRIVILEGED_MEMBERSHIP": return {
      memberId: (f.memberId ?? "").trim(),
      ...(f.role ? { role: f.role } : {}),
      ...(f.status ? { status: f.status } : {}),
      reason,
    };
    case "UPDATE_POLICY": return {
      operationType: f.policyOperation || "REMOVE_OWNER",
      requiredApprovals: Number.parseInt(f.requiredApprovals ?? "", 10),
      ttlSeconds: Number.parseInt(f.ttlSeconds ?? "", 10),
      baseVersion: Number.parseInt(f.baseVersion ?? "", 10),
      reason,
    };
  }
}

/** Client-side validation mirroring server rules; returns an error code or null. */
export function validatePayload(op: Operation, p: Record<string, unknown>): string | null {
  const reason = typeof p.reason === "string" ? p.reason : "";
  if (reason.length < 5 || reason.length > 1000) return "invalid_reason";
  if (op === "REMOVE_OWNER" && !p.targetUserId) return "invalid_target";
  if (op === "INVITE_PRIVILEGED_MEMBER") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.email))) return "invalid_email";
    if (p.role !== "OWNER" && p.role !== "ADMIN") return "invalid_role";
  }
  if (op === "CHANGE_PRIVILEGED_MEMBERSHIP") {
    if (!p.memberId) return "invalid_target";
    if (p.role === undefined && p.status === undefined) return "invalid_request";
  }
  if (op === "UPDATE_POLICY") {
    const n = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
    if (!n(p.requiredApprovals, 2, 10)) return "invalid_quorum";
    if (!n(p.ttlSeconds, 300, 604800)) return "invalid_ttl";
    if (!n(p.baseVersion, 1, Number.MAX_SAFE_INTEGER)) return "invalid_base_version";
  }
  return null;
}

export function formatCountdown(expiresAt: string | Date, now: number = Date.now()): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return "Expired";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${sec}s left`;
  return `${sec}s left`;
}

export function quorumProgress(approvals: { decision: string }[], required: number | null | undefined) {
  const approved = approvals.filter(a => a.decision === "APPROVED").length;
  const rejected = approvals.filter(a => a.decision === "REJECTED").length;
  const req = required && required > 0 ? required : null;
  return { approved, rejected, required: req, text: req ? `${approved} of ${req} approvals` : `${approved} approvals (quorum unknown)`, complete: req !== null && approved >= req };
}

export function effectiveStatus(status: string, expiresAt: string, now: number = Date.now()) {
  if ((status === "PENDING" || status === "AUTHORIZED") && new Date(expiresAt).getTime() <= now) return "EXPIRED";
  return status;
}

export function statusTone(status: string): "pending" | "ok" | "bad" | "muted" {
  if (status === "PENDING") return "pending";
  if (status === "AUTHORIZED" || status === "EXECUTED" || status === "SUCCEEDED") return "ok";
  if (status === "REJECTED" || status === "FAILED") return "bad";
  return "muted";
}

export function canonicalJson(value: unknown): string { return JSON.stringify(value, null, 2); }

export type TimelineInput = {
  createdAt: string; status: string; requester: { displayName: string };
  approvals: { decision: string; createdAt?: string; approver: { displayName: string } }[];
  executions?: { status: string; attemptedAt: string; finishedAt?: string | null; safeErrorCode?: string | null }[];
};
export function buildTimeline(r: TimelineInput) {
  const events: { at: string; label: string }[] = [{ at: r.createdAt, label: `Requested by ${r.requester.displayName}` }];
  for (const a of r.approvals) events.push({ at: a.createdAt ?? r.createdAt, label: `${a.decision === "APPROVED" ? "Approved" : "Rejected"} by ${a.approver.displayName}` });
  for (const e of r.executions ?? []) events.push({ at: e.finishedAt ?? e.attemptedAt, label: `Execution ${e.status}${e.safeErrorCode ? ` (${e.safeErrorCode})` : ""}` });
  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export function newIdempotencyKey(): string { return globalThis.crypto.randomUUID(); }
