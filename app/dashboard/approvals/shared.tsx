"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./approvals.module.css";
import { canonicalJson, effectiveStatus, formatCountdown, operationLabel, quorumProgress, statusTone } from "./helpers";

export type Member = { id: string; role: string; status: string; user: { id: string; displayName: string; email: string | null } };
export type Policy = { operationType: string; requiredApprovals: number; version: number; ttlSeconds: number; active?: boolean };
export type Execution = { id: string; status: string; attemptedAt: string; finishedAt: string | null; safeErrorCode: string | null; executorType: string };
export type FullRequest = {
  id: string; operationType: string; status: string; targetType: string; targetId: string; requesterId: string;
  canonicalPayload: Record<string, unknown>; payloadDigest: string; policyVersion: number;
  requester: { displayName: string; email: string | null };
  approvals: { id: string; approverId: string; decision: string; createdAt: string; approver: { displayName: string; email: string | null } }[];
  executions?: Execution[]; createdAt: string; expiresAt: string;
};

/** Raw fetch that surfaces the server error code and message verbatim. */
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof data.error === "string" ? data.error : `http_${response.status}`;
    const message = typeof data.message === "string" ? `: ${data.message}` : "";
    throw new Error(`${response.status} ${code}${message}`);
  }
  return data as T;
}

const orgPath = (orgId: string) => `/api/organizations/${encodeURIComponent(orgId)}`;
export const requestPath = (orgId: string, id: string) => `${orgPath(orgId)}/requests/${encodeURIComponent(id)}`;

/** Loads requests, members, policies and resolves the signed-in user's membership. */
export function useGovernanceData(orgId: string | null) {
  const [requests, setRequests] = useState<FullRequest[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [me, setMe] = useState<Member | null>(null);
  const [enforcement, setEnforcement] = useState("APP-LEVEL APPROVAL ONLY");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!orgId) return;
    setLoading(true); setError(null);
    try {
      const [r, m, p, s] = await Promise.all([
        api<{ requests: FullRequest[]; enforcement?: string }>(`${orgPath(orgId)}/requests`),
        api<{ members: Member[] }>(`${orgPath(orgId)}/members`),
        api<{ policies: Policy[] }>(`${orgPath(orgId)}/policies`).catch(() => ({ policies: [] as Policy[] })),
        api<{ principal: { email: string | null; displayName: string } }>("/api/auth/session"),
      ]);
      setRequests(r.requests); if (r.enforcement) setEnforcement(r.enforcement);
      setMembers(m.members); setPolicies(p.policies);
      const email = s.principal.email?.toLowerCase();
      setMe(m.members.find(x => email && x.user.email?.toLowerCase() === email) ?? m.members.find(x => x.user.displayName === s.principal.displayName) ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load requests.");
    } finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { void reload(); }, [reload]);
  return { requests, members, policies, me, enforcement, loading, error, reload };
}

export function requiredFor(policies: Policy[], r: { operationType: string; policyVersion: number }) {
  return policies.find(p => p.operationType === r.operationType && p.version === r.policyVersion)?.requiredApprovals ?? null;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`${styles.badge} ${styles[statusTone(status)]}`}>{status}</span>;
}

/** Native <dialog> confirmation: focus-trapped, Esc cancels, keyboard accessible. */
export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel }: { open: boolean; title: string; body: React.ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal(); else if (!open && d.open) d.close();
  }, [open]);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby="confirm-title" onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id="confirm-title">{title}</h2>
    <div>{body}</div>
    <div className={styles.actions} style={{ marginTop: 16 }}>
      <button type="button" className="button" onClick={onConfirm}>{confirmLabel}</button>
      <button type="button" className="secondary-button" onClick={onCancel} autoFocus>Cancel</button>
    </div>
  </dialog>;
}

export function RequestSummary({ request, required, now, enforcement, orgId, linkDetail = true }: { request: FullRequest; required: number | null; now: number; enforcement: string; orgId: string; linkDetail?: boolean }) {
  const status = effectiveStatus(request.status, request.expiresAt, now);
  const q = quorumProgress(request.approvals, required);
  return <>
    <div className={styles.row}>
      <h3 style={{ margin: 0 }}>{operationLabel(request.operationType)}</h3>
      <StatusBadge status={status} />
    </div>
    <span className={styles.enforce}>{enforcement}</span>
    <dl className={styles.facts}>
      <div><dt>Requester</dt><dd>{request.requester.displayName}{request.requester.email ? ` (${request.requester.email})` : ""}</dd></div>
      <div><dt>Operation</dt><dd>{request.operationType}</dd></div>
      <div><dt>Target</dt><dd>{request.targetType ?? ""} {request.targetId}</dd></div>
      <div><dt>Policy version</dt><dd>v{request.policyVersion}</dd></div>
      <div><dt>Quorum</dt><dd>{q.text}{q.rejected ? ` · ${q.rejected} rejected` : ""}</dd></div>
      <div><dt>Expiry</dt><dd><time dateTime={request.expiresAt} title={new Date(request.expiresAt).toLocaleString()}>{formatCountdown(request.expiresAt, now)}</time></dd></div>
    </dl>
    {q.required && <div className={styles.progress} role="progressbar" aria-label="Approval quorum" aria-valuemin={0} aria-valuemax={q.required} aria-valuenow={q.approved}><span style={{ width: `${Math.min(100, (q.approved / q.required) * 100)}%` }} /></div>}
    <div><strong>Canonical payload</strong><pre className={styles.payload}>{canonicalJson(request.canonicalPayload)}</pre></div>
    <div><strong>Payload digest</strong> <code className={styles.digest}>{request.payloadDigest}</code></div>
    {linkDetail && <Link className="text-link" href={`/dashboard/approvals/${encodeURIComponent(request.id)}?org=${encodeURIComponent(orgId)}`}>Details &amp; timeline</Link>}
  </>;
}
