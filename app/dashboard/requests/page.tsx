"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiJson, useWorkspace, type ActionRequest } from "../use-workspace";

export default function RequestsPage() {
  const workspace = useWorkspace();
  const [requests, setRequests] = useState<ActionRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const selected = requests.find(item => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!workspace.organizationId) return;
    let active = true;
    setLoading(true);
    setError(null);
    setSelectedId(null);
    apiJson<{ requests: ActionRequest[] }>(`/api/organizations/${encodeURIComponent(workspace.organizationId)}/requests`)
      .then(data => { if (active) { setRequests(data.requests); setSelectedId(data.requests[0]?.id ?? null); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load requests."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspace.organizationId]);

  async function decide(decision: "approve" | "reject") {
    if (!workspace.organizationId || !selected) return;
    const action = decision === "approve" ? "Approve" : "Reject";
    if (!window.confirm(`${action} this exact ${selected.operationType} request for target ${selected.targetId}? This decision is recorded and cannot be reused for a changed request.`)) return;
    setWorking(true);
    setActionError(null);
    try {
      await apiJson(`/api/organizations/${encodeURIComponent(workspace.organizationId)}/requests/${encodeURIComponent(selected.id)}/${decision}`, { method: "POST" });
      const data = await apiJson<{ requests: ActionRequest[] }>(`/api/organizations/${encodeURIComponent(workspace.organizationId)}/requests`);
      setRequests(data.requests);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Unable to record your decision.");
    } finally {
      setWorking(false);
    }
  }

  const expired = selected ? new Date(selected.expiresAt).getTime() <= Date.now() : false;

  return <main className="dashboard-content">
    <div className="dashboard-intro"><div><span className="overline">Governance</span><h1>Protected requests</h1><p>Review the exact operation before recording a decision.</p></div><Link className="text-link workspace-back-link" href="/dashboard">Overview <span aria-hidden="true">↗</span></Link></div>
    <div className="demo-notice"><span className="notice-icon" aria-hidden="true">!</span><p><strong>APP-LEVEL APPROVAL ONLY</strong> These decisions are enforced by the application. A Tide-backed proof at the final executor is not yet available.</p></div>
    {workspace.loading && <p className="workspace-state" role="status">Loading organizations…</p>}
    {workspace.error && <div className="workspace-state workspace-error" role="alert"><p>{workspace.error}</p><Link href="/auth/login">Sign in</Link></div>}
    {!workspace.loading && !workspace.error && !workspace.organization && <div className="panel workspace-empty"><h2>No organization yet</h2><p>Create a workspace to view its protected requests.</p><Link className="button" href="/dashboard">Create an organization</Link></div>}
    {workspace.organization && <>
      {workspace.organizations.length > 1 && <label className="workspace-select-label">Organization<select value={workspace.organizationId ?? ""} onChange={event => workspace.selectOrganization(event.target.value)}>{workspace.organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {loading && <p className="workspace-state" role="status">Loading requests…</p>}
      {error && <p className="workspace-state workspace-error" role="alert">{error}</p>}
      {!loading && !error && requests.length === 0 && <section className="panel workspace-empty"><h2>No requests yet</h2><p>Protected action requests will appear here when someone in your organization submits one.</p></section>}
      {!loading && !error && requests.length > 0 && <div className="requests-layout"><section className="panel"><div className="panel-heading"><div><span className="overline">{workspace.organization.name}</span><h2>Request history</h2></div><span className="request-count">{requests.length} total</span></div><div className="request-choice-list">{requests.map(request => <button type="button" key={request.id} className={request.id === selectedId ? "request-choice active" : "request-choice"} onClick={() => { setSelectedId(request.id); setActionError(null); }} aria-pressed={request.id === selectedId}><strong>{request.operationType === "REMOVE_OWNER" ? "Remove owner" : request.operationType}</strong><small>{request.requester.displayName} · {new Date(request.createdAt).toLocaleDateString()}</small><span>{new Date(request.expiresAt).getTime() <= Date.now() && request.status === "PENDING" ? "EXPIRED" : request.status}</span></button>)}</div></section>
        {selected && <section className="panel request-detail" aria-labelledby="request-detail-title"><span className="overline">Exact action</span><h2 id="request-detail-title">{selected.operationType === "REMOVE_OWNER" ? "Remove owner" : selected.operationType}</h2><p className="request-detail-intro">Requested by {selected.requester.displayName}. Review every parameter before you decide.</p><dl className="request-facts"><div><dt>Status</dt><dd>{expired && selected.status === "PENDING" ? "EXPIRED" : selected.status}</dd></div><div><dt>Target ID</dt><dd>{selected.targetId}</dd></div><div><dt>Expires</dt><dd>{new Date(selected.expiresAt).toLocaleString()}</dd></div><div><dt>Approvals recorded</dt><dd>{selected.approvals.filter(item => item.decision === "APPROVED").length}</dd></div><div><dt>Payload digest</dt><dd className="digest">{selected.payloadDigest}</dd></div></dl><h3>Parameters to authorize</h3><dl className="request-facts">{Object.entries(selected.canonicalPayload).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl><p className="request-boundary">APP-LEVEL APPROVAL ONLY · A changed operation needs a new request and fresh approvals.</p>{actionError && <p className="form-error" role="alert">{actionError}</p>}{selected.status === "PENDING" && !expired && <div className="request-actions"><button type="button" className="button" disabled={working} onClick={() => void decide("approve")}>{working ? "Recording…" : "Approve exact request"}</button><button type="button" className="secondary-button" disabled={working} onClick={() => void decide("reject")}>Reject request</button></div>}</section>}
      </div>}
    </>}
  </main>;
}
