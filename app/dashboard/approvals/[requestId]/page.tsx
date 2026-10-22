"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useWorkspace } from "../../use-workspace";
import styles from "../approvals.module.css";
import { buildTimeline } from "../helpers";
import { RequestActions } from "../request-actions";
import { api, RequestSummary, requestPath, requiredFor, useGovernanceData, useNow, type FullRequest } from "../shared";

function Detail() {
  const params = useParams<{ requestId: string }>();
  const search = useSearchParams();
  const workspace = useWorkspace();
  const orgId = search.get("org") ?? workspace.organizationId;
  const data = useGovernanceData(orgId);
  const now = useNow();
  const [request, setRequest] = useState<FullRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    try { setRequest((await api<{ request: FullRequest }>(requestPath(orgId, params.requestId))).request); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load request."); }
  }, [orgId, params.requestId]);
  useEffect(() => { void load(); }, [load]);

  return <main className="dashboard-content">
    <div className="dashboard-intro"><div><span className="overline">Governance</span><h1>Request detail</h1></div><Link className="text-link workspace-back-link" href="/dashboard/approvals">Approvals inbox <span aria-hidden="true">↗</span></Link></div>
    {error && <p className="workspace-state workspace-error" role="alert">{error}</p>}
    {!request && !error && <p className="workspace-state" role="status">Loading request…</p>}
    {request && orgId && <div className={styles.grid}>
      <section className={`panel ${styles.card}`}>
        <RequestSummary request={request} required={requiredFor(data.policies, request)} now={now} enforcement={data.enforcement} orgId={orgId} linkDetail={false} />
        <RequestActions request={request} me={data.me} orgId={orgId} now={now} onDone={() => { void load(); void data.reload(); }} />
      </section>
      <section className="panel" aria-labelledby="timeline-title">
        <h2 id="timeline-title">Timeline</h2>
        <ol className={styles.timeline}>{buildTimeline(request).map((e, i) => <li key={i}><time dateTime={e.at}>{new Date(e.at).toLocaleString()}</time>{e.label}</li>)}</ol>
      </section>
    </div>}
  </main>;
}

export default function RequestDetailPage() {
  return <Suspense fallback={<p className="workspace-state" role="status">Loading…</p>}><Detail /></Suspense>;
}
