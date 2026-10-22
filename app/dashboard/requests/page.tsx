"use client";

import Link from "next/link";
import { useState } from "react";
import { useWorkspace } from "../use-workspace";
import { governanceLocked, governanceLockText } from "../governance-lock";
import styles from "../approvals/approvals.module.css";
import { buildPayload, effectiveStatus, newIdempotencyKey, OPERATIONS, operationLabel, validatePayload, type FormFields, type Operation } from "../approvals/helpers";
import { RequestActions } from "../approvals/request-actions";
import { api, RequestSummary, requiredFor, StatusBadge, useGovernanceData, useNow, type FullRequest, type Member, type Policy } from "../approvals/shared";

function NewRequestForm({ orgId, members, policies, locked, onCreated }: { orgId: string; members: Member[]; policies: Policy[]; locked: boolean; onCreated: () => void }) {
  const [op, setOp] = useState<Operation>("REMOVE_OWNER");
  const [f, setF] = useState<FormFields>({});
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const set = (k: keyof FormFields) => (event: { target: { value: string } }) => setF(prev => ({ ...prev, [k]: event.target.value }));
  const owners = members.filter(m => m.role === "OWNER" && m.status === "ACTIVE");

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null); setOk(null);
    if (locked) { setError(governanceLockText(owners.length)); return; }
    const payload = buildPayload(op, f);
    const invalid = validatePayload(op, payload);
    if (invalid) { setError(invalid); return; }
    setWorking(true);
    try {
      const res = await api<{ request: FullRequest }>(`/api/organizations/${encodeURIComponent(orgId)}/requests`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationType: op, idempotencyKey: newIdempotencyKey(), payload }) });
      setOk(`Created request ${res.request.id}`); setF({}); onCreated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create request."); }
    finally { setWorking(false); }
  }

  return <form className={styles.form} onSubmit={submit} aria-labelledby="new-title">
    <h2 id="new-title">New request</h2>
    {locked && <p className={styles.error} role="status">{governanceLockText(owners.length)} <Link href="/dashboard/members">Invite founding owners</Link></p>}
    <label>Operation<select value={op} onChange={event => { setOp(event.target.value as Operation); setF({}); }}>{OPERATIONS.map(o => <option key={o} value={o}>{operationLabel(o)}</option>)}</select></label>
    {op === "REMOVE_OWNER" && <label>Owner to remove<select required value={f.targetUserId ?? ""} onChange={set("targetUserId")}><option value="">Select owner…</option>{owners.map(m => <option key={m.id} value={m.user.id}>{m.user.displayName} {m.user.email ?? ""}</option>)}</select></label>}
    {op === "INVITE_PRIVILEGED_MEMBER" && <>
      <label>Email<input type="email" required value={f.email ?? ""} onChange={set("email")} /></label>
      <label>Role<select value={f.role ?? "ADMIN"} onChange={set("role")}><option value="ADMIN">ADMIN</option><option value="OWNER">OWNER</option></select></label>
    </>}
    {op === "CHANGE_PRIVILEGED_MEMBERSHIP" && <>
      <label>Member<select required value={f.memberId ?? ""} onChange={set("memberId")}><option value="">Select member…</option>{members.map(m => <option key={m.id} value={m.id}>{m.user.displayName} · {m.role} · {m.status}</option>)}</select></label>
      <label>New role (optional)<select value={f.role ?? ""} onChange={set("role")}><option value="">No change</option>{["OWNER", "ADMIN", "MEMBER", "VIEWER"].map(r => <option key={r} value={r}>{r}</option>)}</select></label>
      <label>New status (optional)<select value={f.status ?? ""} onChange={set("status")}><option value="">No change</option>{["ACTIVE", "SUSPENDED", "REMOVED"].map(s => <option key={s} value={s}>{s}</option>)}</select></label>
    </>}
    {op === "UPDATE_POLICY" && <>
      <label>Policy for operation<select value={f.policyOperation ?? "REMOVE_OWNER"} onChange={event => { const v = event.target.value; const cur = policies.find(p => p.operationType === v); setF(prev => ({ ...prev, policyOperation: v, baseVersion: cur ? String(cur.version) : prev.baseVersion })); }}>{OPERATIONS.filter(o => o !== "UPDATE_POLICY").map(o => <option key={o} value={o}>{o}</option>)}</select></label>
      <label>Required approvals (2–10)<input type="number" min={2} max={10} required value={f.requiredApprovals ?? ""} onChange={set("requiredApprovals")} /></label>
      <label>TTL seconds (300–604800)<input type="number" min={300} max={604800} required value={f.ttlSeconds ?? ""} onChange={set("ttlSeconds")} /></label>
      <label>Base version (current active policy version)<input type="number" min={1} required value={f.baseVersion ?? (policies.find(p => p.operationType === (f.policyOperation ?? "REMOVE_OWNER"))?.version ?? "")} onChange={set("baseVersion")} /></label>
    </>}
    <label>Reason (5–1000 chars)<textarea required minLength={5} maxLength={1000} value={f.reason ?? ""} onChange={set("reason")} /></label>
    <pre className={styles.payload} aria-label="Payload preview">{JSON.stringify(buildPayload(op, { ...f, baseVersion: f.baseVersion ?? String(policies.find(p => p.operationType === (f.policyOperation ?? "REMOVE_OWNER"))?.version ?? "") }), null, 2)}</pre>
    {error && <p className={styles.error} role="alert">Error: {error}</p>}
    {ok && <p role="status">{ok}</p>}
    <div className={styles.actions}><button className="button" type="submit" disabled={working || locked}>{working ? "Submitting…" : locked ? "Locked until governance is active" : "Submit request"}</button></div>
  </form>;
}

export default function RequestsPage() {
  const workspace = useWorkspace();
  const data = useGovernanceData(workspace.organizationId);
  const now = useNow();
  const orgId = workspace.organizationId ?? "";
  const mine = data.requests.filter(r => data.me && r.requesterId === data.me.user.id);

  return <main className="dashboard-content">
    <div className="dashboard-intro"><div><span className="overline">Governance</span><h1>My requests</h1><p>Create protected requests and track their outcome.</p></div><Link className="text-link workspace-back-link" href="/dashboard/approvals">Approvals inbox <span aria-hidden="true">↗</span></Link></div>
    <div className="demo-notice"><span className="notice-icon" aria-hidden="true">!</span><p><strong>{data.enforcement}</strong> Decisions are enforced by the application.</p></div>
    {workspace.loading && <p className="workspace-state" role="status">Loading organizations…</p>}
    {workspace.error && <div className="workspace-state workspace-error" role="alert"><p>{workspace.error}</p><Link href="/auth/login">Sign in</Link></div>}
    {!workspace.loading && !workspace.error && !workspace.organization && <div className="panel workspace-empty"><h2>No organization yet</h2><Link className="button" href="/dashboard">Create an organization</Link></div>}
    {workspace.organizations.length > 1 && <label className="workspace-select-label">Organization<select value={orgId} onChange={event => workspace.selectOrganization(event.target.value)}>{workspace.organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    {data.error && <p className="workspace-state workspace-error" role="alert">{data.error}</p>}
    {workspace.organization && <div className={styles.grid}>
      <section className="panel"><NewRequestForm orgId={orgId} members={data.members} policies={data.policies} locked={governanceLocked(workspace.organization.setupStatus)} onCreated={() => void data.reload()} /></section>
      <section className="panel" aria-labelledby="mine-title">
        <h2 id="mine-title">Submitted by me ({mine.length})</h2>
        {data.loading && <p role="status">Loading…</p>}
        {!data.loading && mine.length === 0 && <p className={styles.note}>You have not submitted any requests.</p>}
        <div className={styles.grid}>{mine.map(r => {
          const exec = r.executions?.[r.executions.length - 1];
          return <article key={r.id} className={styles.card}>
            <RequestSummary request={r} required={requiredFor(data.policies, r)} now={now} enforcement={data.enforcement} orgId={orgId} />
            <p className={styles.note}>Outcome: {exec ? <><StatusBadge status={exec.status} />{exec.safeErrorCode ? ` ${exec.safeErrorCode}` : ""}</> : effectiveStatus(r.status, r.expiresAt, now) === "EXECUTED" ? "Executed" : "Not executed"}</p>
            <RequestActions request={r} me={data.me} orgId={orgId} now={now} onDone={() => void data.reload()} />
          </article>;
        })}</div>
      </section>
    </div>}
  </main>;
}
