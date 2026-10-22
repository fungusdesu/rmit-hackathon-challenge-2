"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { apiJson, useWorkspace } from "../use-workspace";
import { governanceLocked, governanceLockText } from "../governance-lock";
import { buildPolicyChangeRequest, eligibleApprovers, formatTtl, GOVERNABLE_OPERATIONS, validatePolicyChange } from "./policy-change";
import type { CheckStatus, SystemHealth } from "@/lib/system-health";
import styles from "./settings.module.css";

type Policy = { id: string; operationType: string; requiredApprovals: number; eligibleRoles: unknown; forbidSelfApproval: boolean; ttlSeconds: number; version: number };

const LABELS: Record<string, string> = {
  REMOVE_OWNER: "Remove owner",
  INVITE_PRIVILEGED_MEMBER: "Invite owner/admin",
  CHANGE_PRIVILEGED_MEMBERSHIP: "Change privileged membership",
  UPDATE_POLICY: "Update policy",
};
const STATUS_TEXT: Record<CheckStatus, string> = { ok: "Healthy", degraded: "Degraded", down: "Down", not_configured: "Not configured" };

function roles(value: unknown) { return Array.isArray(value) ? value.join(", ") : String(value ?? "—"); }

function Status({ status }: { status: CheckStatus }) {
  return <span className={`${styles.status} ${styles[status]}`}><span aria-hidden="true" className={styles.dot} />{STATUS_TEXT[status]}</span>;
}

export default function SettingsPage() {
  const workspace = useWorkspace();
  const orgId = workspace.organizationId;
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [owners, setOwners] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [operationType, setOperationType] = useState<string>(GOVERNABLE_OPERATIONS[0]);
  const [requiredApprovals, setRequiredApprovals] = useState(2);
  const [ttlHours, setTtlHours] = useState(24);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const loadHealth = useCallback(() => {
    setHealthError(null);
    apiJson<{ health: SystemHealth }>("/api/system/health").then(d => setHealth(d.health)).catch(e => setHealthError(e instanceof Error ? e.message : "Health check failed."));
  }, []);
  useEffect(() => { loadHealth(); }, [loadHealth]);

  const loadPolicies = useCallback(async (id: string) => {
    setLoadError(null);
    try {
      const base = `/api/organizations/${encodeURIComponent(id)}`;
      const [p, s] = await Promise.all([
        apiJson<{ policies: Policy[] }>(`${base}/policies`),
        apiJson<{ summary: { activeOwners: number } }>(`${base}/summary`),
      ]);
      setPolicies(p.policies);
      setOwners(s.summary.activeOwners);
    } catch (e) { setLoadError(e instanceof Error ? e.message : "Unable to load policies."); }
  }, []);
  useEffect(() => { if (orgId) void loadPolicies(orgId); }, [orgId, loadPolicies]);

  const current = policies.find(p => p.operationType === operationType);
  useEffect(() => {
    if (current) { setRequiredApprovals(current.requiredApprovals); setTtlHours(Math.max(1, Math.round(current.ttlSeconds / 3600))); }
  }, [current]);

  const draft = { operationType, requiredApprovals, ttlSeconds: Math.round(ttlHours * 3600), baseVersion: current?.version ?? 0, reason };
  const check = useMemo(() => validatePolicyChange(draft, owners, current), [draft.operationType, draft.requiredApprovals, draft.ttlSeconds, draft.baseVersion, draft.reason, owners, current]); // eslint-disable-line react-hooks/exhaustive-deps

  const locked = governanceLocked(workspace.organization?.setupStatus);

  async function propose(event: FormEvent) {
    event.preventDefault();
    if (!orgId || locked || check.errors.length) return;
    setSubmitting(true); setSubmitError(null); setSubmitted(null);
    try {
      const body = buildPolicyChangeRequest(draft, crypto.randomUUID());
      await apiJson(`/api/organizations/${encodeURIComponent(orgId)}/requests`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      setSubmitted(`Proposal submitted for ${LABELS[operationType] ?? operationType}. It takes effect only after the required owners approve it.`);
      setReason("");
    } catch (e) { setSubmitError(e instanceof Error ? e.message : "Unable to submit proposal."); }
    finally { setSubmitting(false); }
  }

  const rows: { label: string; status: CheckStatus; detail: string }[] = health ? [
    { label: "Authentication mode", status: health.authMode === "tide" ? "ok" : "degraded", detail: health.authMode === "tide" ? "TideCloak" : "Development (insecure local auth)" },
    { label: "Tide configuration", status: health.tide.status, detail: `${health.tide.detail} · realm ${health.tide.realmConfigured ? "yes" : "no"} · client ${health.tide.clientConfigured ? "yes" : "no"} · vendorId ${health.tide.vendorIdPresent ? "yes" : "no"}` },
    { label: "Database", status: health.database.status, detail: health.database.detail },
    { label: "Migrations", status: health.migrations.status, detail: health.migrations.detail },
    { label: "Object storage", status: health.storage.status, detail: health.storage.detail },
  ] : [];

  return <main className="dashboard-content">
    <div className="dashboard-intro"><div><span className="overline">Settings</span><h1>Security settings</h1><p>Quorum policies and integration health.</p></div><Link className="text-link workspace-back-link" href="/dashboard">Overview <span aria-hidden="true">↗</span></Link></div>
    <div className="demo-notice"><span className="notice-icon" aria-hidden="true">!</span><p><strong>APP-LEVEL APPROVAL ONLY — not cryptographically enforced by Tide yet.</strong> Policy changes are themselves governed requests that need owner approval.</p></div>

    {workspace.loading && <p className="workspace-state" role="status">Loading organizations…</p>}
    {workspace.error && <div className="workspace-state workspace-error" role="alert"><p>{workspace.error}</p><Link href="/auth/login">Sign in</Link></div>}

    {workspace.organization && <>
      {workspace.organizations.length > 1 && <label className="workspace-select-label">Organization<select value={orgId ?? ""} onChange={e => workspace.selectOrganization(e.target.value)}>{workspace.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
      <section className={`panel ${styles.section}`} aria-labelledby="policies-title">
        <div className="panel-heading"><div><span className="overline">{workspace.organization.name}</span><h2 id="policies-title">Quorum policies</h2></div><span className="request-count">{owners} active owner{owners === 1 ? "" : "s"}</span></div>
        {loadError && <p className="workspace-state workspace-error" role="alert">{loadError}</p>}
        <div className={styles.tableWrap}><table className={styles.table}>
          <caption className={styles.srOnly}>Active policy per protected operation</caption>
          <thead><tr><th scope="col">Operation</th><th scope="col">Required approvals</th><th scope="col">Eligible roles</th><th scope="col">Self-approval</th><th scope="col">Approval window</th><th scope="col">Version</th></tr></thead>
          <tbody>{policies.map(p => <tr key={p.id}><th scope="row">{LABELS[p.operationType] ?? p.operationType}</th><td data-label="Required approvals">{p.requiredApprovals}</td><td data-label="Eligible roles">{roles(p.eligibleRoles)}</td><td data-label="Self-approval">{p.forbidSelfApproval ? "Forbidden" : "Allowed"}</td><td data-label="Approval window">{formatTtl(p.ttlSeconds)}</td><td data-label="Version">v{p.version}</td></tr>)}
            {!policies.length && !loadError && <tr><td colSpan={6}>No active policies.</td></tr>}</tbody>
        </table></div>
      </section>

      <section className={`panel ${styles.section}`} aria-labelledby="propose-title">
        <span className="overline">Governed change</span><h2 id="propose-title">Propose a policy change</h2>
        <p className={styles.muted}>Creates an <code>UPDATE_POLICY</code> request. Nothing changes until owners approve it in <Link href="/dashboard/approvals">Approvals</Link>. The UPDATE_POLICY policy itself cannot be changed here.</p>
        {locked && <p className={styles.warning} role="status">{governanceLockText(owners)} <Link href="/dashboard/members">Invite founding owners</Link></p>}
        <form className={styles.form} onSubmit={propose} noValidate>
          <label>Operation<select value={operationType} onChange={e => setOperationType(e.target.value)}>{GOVERNABLE_OPERATIONS.map(op => <option key={op} value={op}>{LABELS[op]}</option>)}</select></label>
          <label>Required approvals<input type="number" min={1} max={10} value={Number.isNaN(requiredApprovals) ? "" : requiredApprovals} onChange={e => setRequiredApprovals(e.target.valueAsNumber)} aria-describedby="quorum-hint" /><small id="quorum-hint">{eligibleApprovers(operationType, owners)} owner(s) eligible to approve (requester{operationType === "REMOVE_OWNER" ? " and target" : ""} excluded)</small></label>
          <label>Approval window (hours)<input type="number" min={1} max={168} value={Number.isNaN(ttlHours) ? "" : ttlHours} onChange={e => setTtlHours(e.target.valueAsNumber)} /></label>
          <label className={styles.wide}>Reason<textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} placeholder="Why should this policy change?" /></label>
          <p className={styles.wide}>Current: {current ? `${current.requiredApprovals} approvals · ${formatTtl(current.ttlSeconds)} · v${current.version}` : "unknown"}</p>
          {(check.errors.length > 0 || check.warnings.length > 0) && <ul className={`${styles.wide} ${styles.checks}`} aria-live="polite">
            {check.errors.map(m => <li key={m} className={styles.error}>Error: {m}</li>)}
            {check.warnings.map(m => <li key={m} className={styles.warning}>Warning: {m}</li>)}
          </ul>}
          {submitError && <p className={`form-error ${styles.wide}`} role="alert">{submitError}</p>}
          {submitted && <p className={`${styles.wide} ${styles.success}`} role="status">{submitted} <Link href="/dashboard/approvals">Go to approvals</Link></p>}
          <div className={styles.wide}><button type="submit" className="button" disabled={submitting || locked || check.errors.length > 0}>{submitting ? "Submitting…" : locked ? "Locked until governance is active" : "Submit for approval"}</button></div>
        </form>
      </section>
    </>}

    <section className={`panel ${styles.section}`} aria-labelledby="health-title">
      <div className="panel-heading"><div><span className="overline">System</span><h2 id="health-title">Integration health</h2></div><button type="button" className="secondary-button" onClick={loadHealth}>Re-check</button></div>
      {healthError && <p className="workspace-state workspace-error" role="alert">{healthError}</p>}
      {!health && !healthError && <p role="status">Checking…</p>}
      {health && <><dl className={styles.health}>{rows.map(r => <div key={r.label}><dt>{r.label}</dt><dd><Status status={r.status} /><span className={styles.muted}>{r.detail}</span></dd></div>)}</dl>
        <p className={styles.muted}>App version {health.appVersion} · checked {new Date(health.checkedAt).toLocaleTimeString()}</p></>}
    </section>

    <section className={`panel ${styles.section}`} aria-labelledby="backup-title">
      <span className="overline">Honest status</span><h2 id="backup-title">Backups &amp; recovery</h2>
      <p className={styles.muted}>The following are <strong>not implemented</strong> in this build:</p>
      <ul className={styles.list}>
        <li>Automated Postgres backups or point-in-time recovery</li>
        <li>Object storage versioning, replication or backup of encrypted documents</li>
        <li>Tide-based key recovery or owner account recovery flows</li>
        <li>Restore drills or documented recovery runbooks</li>
        <li>Audit-log export / off-site archival</li>
      </ul>
    </section>
  </main>;
}
