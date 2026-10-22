"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { apiJson, useWorkspace, type ActionRequest, type Summary } from "./use-workspace";

export default function DashboardPage() {
  const workspace = useWorkspace();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [requests, setRequests] = useState<ActionRequest[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace.organizationId) return;
    let active = true;
    setDataLoading(true);
    setDataError(null);
    setSummary(null);
    const base = `/api/organizations/${encodeURIComponent(workspace.organizationId)}`;
    Promise.all([
      apiJson<{ summary: Summary }>(`${base}/summary`),
      apiJson<{ requests: ActionRequest[] }>(`${base}/requests`),
    ]).then(([summaryData, requestData]) => {
      if (!active) return;
      setSummary(summaryData.summary);
      setRequests(requestData.requests);
    }).catch(cause => {
      if (active) setDataError(cause instanceof Error ? cause.message : "Unable to load the overview.");
    }).finally(() => { if (active) setDataLoading(false); });
    return () => { active = false; };
  }, [workspace.organizationId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setFormError(null);
    try {
      await workspace.createOrganization(name.trim(), description.trim());
      setName("");
      setDescription("");
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not create the organization.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="dashboard-content">
      <div className="dashboard-intro"><div><span className="overline">Workspace overview</span><h1>{workspace.organization ? workspace.organization.name : "Your workspace"}</h1><p>Organization activity and governance at a glance.</p></div></div>
      <div className="demo-notice"><span className="notice-icon" aria-hidden="true">!</span><p><strong>APP-LEVEL APPROVAL ONLY</strong> The current owner-removal workflow uses application checks. Tide-backed action enforcement and encrypted document storage are not connected.</p></div>

      {workspace.loading && <p className="workspace-state" role="status">Loading organizations…</p>}
      {workspace.error && <div className="workspace-state workspace-error" role="alert"><p>{workspace.error}</p><button type="button" onClick={() => void workspace.refresh()}>Try again</button><Link href="/auth/login">Sign in</Link></div>}

      {!workspace.loading && !workspace.error && workspace.organizations.length === 0 && (
        <section className="panel workspace-empty"><span className="overline">Get started</span><h2>Create your first organization</h2><p>Your organization will appear here after creation. You can invite co-owners once the invitation flow is available.</p><form onSubmit={create} className="workspace-form"><label>Organization name<input required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Example: Northstar Labs" /></label><label>Description <span>(optional)</span><textarea maxLength={500} value={description} onChange={event => setDescription(event.target.value)} placeholder="What does your team manage?" /></label>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="button" type="submit" disabled={creating}>{creating ? "Creating…" : "Create organization"}</button></form></section>
      )}

      {workspace.organization && <>
        {workspace.organizations.length > 1 && <label className="workspace-select-label">Organization<select value={workspace.organizationId ?? ""} onChange={event => workspace.selectOrganization(event.target.value)}>{workspace.organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {dataLoading && <p className="workspace-state" role="status">Loading organization data…</p>}
        {dataError && <div className="workspace-state workspace-error" role="alert"><p>{dataError}</p><button type="button" onClick={() => window.location.reload()}>Reload</button></div>}
        {summary && !dataError && <>
          <section className="metric-grid" aria-label="Live organization summary">
            <article><div className="metric-top"><span>Open requests</span><span className="metric-icon" aria-hidden="true">↗</span></div><strong>{summary.pendingApprovals.toLocaleString()}</strong><small>Pending approval</small></article>
            <article><div className="metric-top"><span>Document records</span><span className="metric-icon" aria-hidden="true">◇</span></div><strong>{summary.protectedDocuments.toLocaleString()}</strong><small>Encryption flow pending</small></article>
            <article><div className="metric-top"><span>Active owners</span><span className="metric-icon" aria-hidden="true">◎</span></div><strong>{summary.activeOwners.toLocaleString()}</strong><small>Current memberships</small></article>
            <article><div className="metric-top"><span>Audit events</span><span className="metric-icon" aria-hidden="true">⌁</span></div><strong>{summary.securityEvents.toLocaleString()}</strong><small>Last 30 days</small></article>
          </section>
          <section className="panel overview-requests"><div className="panel-heading"><div><span className="overline">Governance</span><h2>Recent requests</h2></div><Link href="/dashboard/requests">View all <span aria-hidden="true">→</span></Link></div>{requests.length === 0 ? <p className="workspace-empty-copy">No protected action requests yet.</p> : <div className="request-list">{requests.slice(0, 4).map(request => <div className="request-item" key={request.id}><span className="request-type type-owner" aria-hidden="true">↗</span><div className="request-copy"><strong>{request.operationType === "REMOVE_OWNER" ? "Remove owner" : request.operationType}</strong><span>Requested by {request.requester.displayName} · {request.approvals.filter(item => item.decision === "APPROVED").length} approvals</span></div><span className="request-risk">{request.status}</span></div>)}</div>}</section>
        </>}
      </>}
    </main>
  );
}
