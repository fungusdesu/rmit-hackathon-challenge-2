"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { apiJson, useSessionPrincipal, useWorkspace, type ActionRequest, type AuditEventItem, type PolicyItem, type Summary } from "./use-workspace";
import Icon from "../components/ui-icon";

function operationLabel(type: string) {
  return type.toLowerCase().split("_").map(word => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}

function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function DashboardPage() {
  const workspace = useWorkspace();
  const principal = useSessionPrincipal();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [requests, setRequests] = useState<ActionRequest[]>([]);
  const [events, setEvents] = useState<AuditEventItem[]>([]);
  const [policies, setPolicies] = useState<PolicyItem[] | null>(null);
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
      apiJson<{ events: AuditEventItem[] }>(`${base}/audit`).catch(() => ({ events: [] as AuditEventItem[] })),
      apiJson<{ policies: PolicyItem[] }>(`${base}/policies`).catch(() => null),
    ]).then(([summaryData, requestData, auditData, policyData]) => {
      if (!active) return;
      setSummary(summaryData.summary);
      setRequests(requestData.requests);
      setEvents(auditData.events.slice(0, 10));
      setPolicies(policyData?.policies ?? null);
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

  const isMe = (person: { displayName: string; email: string | null }) =>
    !!principal && ((!!person.email && person.email === principal.email) || person.displayName === principal.displayName);
  const attention = requests.filter(request => request.status === "PENDING" && !isMe(request.requester) && !request.approvals.some(approval => isMe(approval.approver)));
  const weakPolicies = (policies ?? []).filter(policy => policy.active !== false && policy.requiredApprovals <= 1);
  const lowOwners = summary ? summary.activeOwners < 3 : false;

  const createForm = <form onSubmit={create} className="workspace-form"><label>Organization name<input required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Example: Northstar Labs" /></label><label>Description <span>(optional)</span><textarea maxLength={500} value={description} onChange={event => setDescription(event.target.value)} placeholder="What does your team manage?" /></label>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="button" type="submit" disabled={creating}>{creating ? "Creating…" : "Create organization"}</button></form>;

  return (
    <main className="dashboard-content">
      <div className="dashboard-intro"><div><span className="overline">Workspace overview</span><h1>{workspace.organization ? workspace.organization.name : "Your workspace"}</h1><p>Organization activity and governance at a glance.</p></div></div>

      {workspace.loading && <p className="workspace-state" role="status">Loading organizations…</p>}
      {workspace.error && <div className="workspace-state workspace-error" role="alert"><p>{workspace.error}</p><button type="button" onClick={() => void workspace.refresh()}>Try again</button><Link href="/auth/login">Sign in</Link></div>}

      {!workspace.loading && !workspace.error && workspace.organizations.length === 0 && (
        <section className="panel workspace-empty"><span className="overline">Get started</span><h2>Create your first organization</h2><p>Your organization will appear here after creation. Invite co-owners from Members &amp; owners.</p>{createForm}</section>
      )}

      {workspace.organization && <>
        <div className="workspace-select-label">
          {workspace.organizations.length > 1 && <label>Organization <select value={workspace.organizationId ?? ""} onChange={event => workspace.selectOrganization(event.target.value)}>{workspace.organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          <details><summary>New organization</summary>{createForm}</details>
        </div>
        {dataLoading && <p className="workspace-state" role="status">Loading organization data…</p>}
        {dataError && <div className="workspace-state workspace-error" role="alert"><p>{dataError}</p><button type="button" onClick={() => window.location.reload()}>Reload</button></div>}
        {summary && !dataError && <>
          {(lowOwners || weakPolicies.length > 0) && <div className="demo-notice" role="status"><span className="notice-icon" aria-hidden="true">!</span><p><strong>OWNERSHIP HEALTH</strong> {lowOwners && <>Only {summary.activeOwners} active owner{summary.activeOwners === 1 ? "" : "s"}; at least 3 are recommended so no single person can block or take over the organization. </>}{weakPolicies.length > 0 && <>{weakPolicies.length} polic{weakPolicies.length === 1 ? "y requires" : "ies require"} only one approval ({weakPolicies.map(policy => operationLabel(policy.operationType)).join(", ")}). </>}<Link href={lowOwners ? "/dashboard/members" : "/dashboard/settings"}>Review</Link></p></div>}
          <section className="metric-grid" aria-label="Live organization summary">
            <Link href="/dashboard/approvals"><article><div className="metric-top"><span>Pending approvals</span><Icon name="approvals" size={22} /></div><strong>{summary.pendingApprovals.toLocaleString()}</strong><small>Open protected requests</small></article></Link>
            <Link href="/dashboard/vault"><article><div className="metric-top"><span>Protected documents</span><Icon name="vault" size={22} /></div><strong>{summary.protectedDocuments.toLocaleString()}</strong><small>In the document vault</small></article></Link>
            <Link href="/dashboard/members"><article><div className="metric-top"><span>Active owners</span><Icon name="members" size={22} /></div><strong>{summary.activeOwners.toLocaleString()}</strong><small>Current memberships</small></article></Link>
            <Link href="/dashboard/audit"><article><div className="metric-top"><span>Security events</span><Icon name="audit" size={22} /></div><strong>{summary.securityEvents.toLocaleString()}</strong><small>Last 30 days</small></article></Link>
          </section>
          <section className="panel overview-requests"><div className="panel-heading"><div><span className="overline">Governance</span><h2>Needs your attention</h2></div><Link href="/dashboard/approvals">Approvals inbox <Icon name="arrow" size={16} /></Link></div>{attention.length === 0 ? <p className="workspace-empty-copy">Nothing is waiting for your approval.</p> : <div className="request-list">{attention.slice(0, 5).map(request => <Link className="request-item" key={request.id} href="/dashboard/approvals"><span className="request-type type-owner"><Icon name="requests" size={20} /></span><div className="request-copy"><strong>{operationLabel(request.operationType)}</strong><span>Requested by {request.requester.displayName} · {request.approvals.filter(item => item.decision === "APPROVED").length} approvals · expires {new Date(request.expiresAt).toLocaleString()}</span></div><span className="request-risk">{request.status}</span></Link>)}</div>}</section>
          <section className="panel overview-requests"><div className="panel-heading"><div><span className="overline">Audit</span><h2>Recent activity</h2></div><Link href="/dashboard/audit">Audit log <Icon name="arrow" size={16} /></Link></div>{events.length === 0 ? <p className="workspace-empty-copy">No audit events yet.</p> : <div className="request-list">{events.map(event => <div className="request-item" key={event.id}><span className="request-type"><Icon name="audit" size={20} /></span><div className="request-copy"><strong>{operationLabel(event.action)}</strong><span>{event.target} · {timeAgo(event.occurredAt)}</span></div></div>)}</div>}</section>
        </>}
      </>}
    </main>
  );
}
