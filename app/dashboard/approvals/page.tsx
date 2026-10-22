"use client";

import Link from "next/link";
import { useWorkspace } from "../use-workspace";
import styles from "./approvals.module.css";
import { effectiveStatus } from "./helpers";
import { RequestActions } from "./request-actions";
import { RequestSummary, requiredFor, useGovernanceData, useNow } from "./shared";

export default function ApprovalsPage() {
  const workspace = useWorkspace();
  const data = useGovernanceData(workspace.organizationId);
  const now = useNow();
  const inbox = data.requests.filter(r => effectiveStatus(r.status, r.expiresAt, now) === "PENDING" || effectiveStatus(r.status, r.expiresAt, now) === "AUTHORIZED");
  const actionable = inbox.filter(r => !data.me || r.requesterId !== data.me.user.id);
  const mine = inbox.filter(r => data.me && r.requesterId === data.me.user.id);
  const orgId = workspace.organizationId ?? "";

  return <main className="dashboard-content">
    <div className="dashboard-intro"><div><span className="overline">Governance</span><h1>Approvals inbox</h1><p>Review the exact canonical payload before recording a decision.</p></div><Link className="text-link workspace-back-link" href="/dashboard/requests">My requests <span aria-hidden="true">↗</span></Link></div>
    <div className="demo-notice"><span className="notice-icon" aria-hidden="true">!</span><p><strong>{data.enforcement}</strong> Decisions are enforced by the application; no Tide-backed proof at the executor yet.</p></div>
    {workspace.loading && <p className="workspace-state" role="status">Loading organizations…</p>}
    {workspace.error && <div className="workspace-state workspace-error" role="alert"><p>{workspace.error}</p><Link href="/auth/login">Sign in</Link></div>}
    {workspace.organizations.length > 1 && <label className="workspace-select-label">Organization<select value={orgId} onChange={event => workspace.selectOrganization(event.target.value)}>{workspace.organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    {data.loading && <p className="workspace-state" role="status">Loading requests…</p>}
    {data.error && <p className="workspace-state workspace-error" role="alert">{data.error}</p>}
    {workspace.organization && !data.loading && !data.error && <div className={styles.grid}>
      <section className="panel" aria-labelledby="inbox-title">
        <h2 id="inbox-title">Awaiting your action ({actionable.length})</h2>
        {actionable.length === 0 && <p className={styles.note}>Nothing to review right now.</p>}
        <div className={styles.grid}>{actionable.map(r => <article key={r.id} className={styles.card}>
          <RequestSummary request={r} required={requiredFor(data.policies, r)} now={now} enforcement={data.enforcement} orgId={orgId} />
          <RequestActions request={r} me={data.me} orgId={orgId} now={now} onDone={() => void data.reload()} />
        </article>)}</div>
      </section>
      {mine.length > 0 && <section className="panel" aria-labelledby="mine-title">
        <h2 id="mine-title">Your open requests ({mine.length})</h2>
        <p className={styles.note}>Self-approval is forbidden: other eligible owners must approve these.</p>
        <div className={styles.grid}>{mine.map(r => <article key={r.id} className={styles.card}>
          <RequestSummary request={r} required={requiredFor(data.policies, r)} now={now} enforcement={data.enforcement} orgId={orgId} />
          <RequestActions request={r} me={data.me} orgId={orgId} now={now} onDone={() => void data.reload()} />
        </article>)}</div>
      </section>}
    </div>}
  </main>;
}
