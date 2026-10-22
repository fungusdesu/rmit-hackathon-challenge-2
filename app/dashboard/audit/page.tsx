"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiJson, useWorkspace } from "../use-workspace";
import styles from "./audit.module.css";

type AuditEvent = { id: string; actorId: string | null; action: string; target: string; correlationId: string; eventJson: unknown; occurredAt: string; eventHash: string; previousEventHash: string | null; hashVersion: number };
type Verify = { ok: boolean; checked: number; total: number; legacyUnverifiable: number; forks: { previousEventHash: string | null; eventIds: string[] }[]; firstBrokenEventId?: string; reason?: string; integrity: string };

const CATEGORIES = [
  { key: "approval", label: "Approval", test: /approv|reject|decision/i },
  { key: "execution", label: "Execution", test: /execut/i },
  { key: "request", label: "Request", test: /request/i },
  { key: "vault", label: "Vault", test: /vault|document|upload/i },
  { key: "asset", label: "Asset", test: /asset/i },
] as const;
function category(action: string) { return CATEGORIES.find(c => c.test.test(action)) ?? { key: "other", label: "Other" }; }

export default function AuditPage() {
  const workspace = useWorkspace();
  const orgId = workspace.organizationId;
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [verify, setVerify] = useState<Verify | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let active = true;
    setLoading(true); setError(null); setVerify(null);
    apiJson<{ events: AuditEvent[] }>(`/api/organizations/${encodeURIComponent(orgId)}/audit`)
      .then(data => { if (active) { const sorted = [...data.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)); setEvents(sorted); setSelectedId(sorted.at(-1)?.id ?? null); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load audit events."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [orgId]);

  const actions = useMemo(() => [...new Set(events.map(e => e.action))].sort(), [events]);
  const actors = useMemo(() => [...new Set(events.map(e => e.actorId ?? "system"))].sort(), [events]);
  const filtered = events.filter(e => (!action || e.action === action) && (!actor || (e.actorId ?? "system") === actor)
    && (!from || e.occurredAt >= new Date(from).toISOString()) && (!to || e.occurredAt < new Date(new Date(to).getTime() + 86400000).toISOString()));
  const selected = events.find(e => e.id === selectedId) ?? null;

  async function runVerify() {
    if (!orgId) return;
    setVerifying(true); setVerifyError(null);
    try { setVerify(await apiJson<Verify>(`/api/organizations/${encodeURIComponent(orgId)}/audit/verify`)); }
    catch (cause) { setVerifyError(cause instanceof Error ? cause.message : "Verification failed."); }
    finally { setVerifying(false); }
  }

  const exportHref = (format: string) => orgId ? `/api/organizations/${encodeURIComponent(orgId)}/audit/export?format=${format}` : "#";

  return <main className="dashboard-content">
    <div className="dashboard-intro"><div><span className="overline">Governance</span><h1>Audit log</h1><p>Append-only, hash-chained record of governance and vault activity.</p></div><Link className="text-link workspace-back-link" href="/dashboard">Overview <span aria-hidden="true">↗</span></Link></div>
    <div className="demo-notice" role="note"><span className="notice-icon" aria-hidden="true">!</span><p><strong>DATABASE HASH CHAIN ONLY</strong> Verification detects edits relative to the database itself. A database superuser can rewrite the entire chain; there is no external anchor yet.</p></div>
    {workspace.loading && <p className="workspace-state" role="status">Loading organizations…</p>}
    {workspace.error && <div className="workspace-state workspace-error" role="alert"><p>{workspace.error}</p><Link href="/auth/login">Sign in</Link></div>}
    {workspace.organization && <>
      {workspace.organizations.length > 1 && <label className="workspace-select-label">Organization<select value={orgId ?? ""} onChange={e => workspace.selectOrganization(e.target.value)}>{workspace.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
      <section className={`panel ${styles.toolbar}`} aria-label="Integrity tools">
        <button type="button" className="button" onClick={runVerify} disabled={verifying}>{verifying ? "Verifying…" : "Verify chain"}</button>
        <a className="button secondary" href={exportHref("json")} download>Export JSON</a>
        <a className="button secondary" href={exportHref("csv")} download>Export CSV</a>
        <div aria-live="polite" className={styles.verifyResult}>
          {verifyError && <p className={styles.bad}>{verifyError} (verify/export require Owner, Admin or Auditor role)</p>}
          {verify && <p className={verify.ok ? styles.good : styles.bad}>
            <strong>{verify.ok ? "CHAIN INTACT" : "CHAIN PROBLEM"}</strong> {verify.checked}/{verify.total} events checked.
            {verify.legacyUnverifiable > 0 && ` ${verify.legacyUnverifiable} legacy event(s) could not be recomputed.`}
            {verify.reason && ` ${verify.reason}.`}
            {verify.firstBrokenEventId && <> First broken event: <button type="button" className={styles.linkButton} onClick={() => setSelectedId(verify.firstBrokenEventId!)}>{verify.firstBrokenEventId}</button>.</>}
            {verify.forks.length > 0 && ` ${verify.forks.length} fork(s): ${verify.forks.map(f => f.eventIds.join(" / ")).join("; ")}.`}
          </p>}
        </div>
      </section>
      <section className={`panel ${styles.filters}`} aria-label="Filters">
        <label>Action<select value={action} onChange={e => setAction(e.target.value)}><option value="">All</option>{actions.map(a => <option key={a}>{a}</option>)}</select></label>
        <label>Actor<select value={actor} onChange={e => setActor(e.target.value)}><option value="">All</option>{actors.map(a => <option key={a}>{a}</option>)}</select></label>
        <label>From<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label>To<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        <small>Showing {filtered.length} of {events.length} most recent events (list API returns the latest 100; use Export for all).</small>
      </section>
      {loading && <p className="workspace-state" role="status">Loading audit events…</p>}
      {error && <p className="workspace-state workspace-error" role="alert">{error}</p>}
      {!loading && !error && <div className={styles.layout}>
        <section className={`panel ${styles.tableWrap}`}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>Audit events, oldest first</caption>
            <thead><tr><th scope="col">Time</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col">Correlation</th></tr></thead>
            <tbody>{filtered.map(e => { const c = category(e.action); return <tr key={e.id} className={e.id === selectedId ? styles.selected : undefined} aria-selected={e.id === selectedId}>
              <td><button type="button" className={styles.linkButton} onClick={() => setSelectedId(e.id)}>{new Date(e.occurredAt).toLocaleString()}</button></td>
              <td>{e.actorId ?? "system"}</td>
              <td><span className={`${styles.badge} ${styles[c.key]}`}>{c.label}</span> {e.action}</td>
              <td className={styles.mono}>{e.target}</td>
              <td className={styles.mono}>{e.correlationId.slice(0, 8)}</td>
            </tr>; })}</tbody>
          </table>
          {filtered.length === 0 && <p className="workspace-state">No events match.</p>}
        </section>
        <aside className={`panel ${styles.detail}`} aria-label="Event detail">
          {selected ? <>
            <h2>{selected.action}</h2>
            <dl>
              <dt>Event id</dt><dd className={styles.mono}>{selected.id}</dd>
              <dt>Occurred</dt><dd>{new Date(selected.occurredAt).toISOString()}</dd>
              <dt>Correlation id</dt><dd className={styles.mono}>{selected.correlationId}</dd>
              <dt>Hash (v{selected.hashVersion})</dt><dd className={styles.mono}>{selected.eventHash}</dd>
              <dt>Previous hash</dt><dd className={styles.mono}>{selected.previousEventHash ?? "(genesis)"}</dd>
            </dl>
            <h3>eventJson</h3>
            <pre className={styles.pre}>{JSON.stringify(selected.eventJson, null, 2)}</pre>
          </> : <p>Select an event to see details.</p>}
        </aside>
      </div>}
    </>}
  </main>;
}
