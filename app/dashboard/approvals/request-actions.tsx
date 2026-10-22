"use client";

import { useState } from "react";
import styles from "./approvals.module.css";
import { effectiveStatus, operationLabel } from "./helpers";
import { api, ConfirmDialog, requestPath, type FullRequest, type Member } from "./shared";

type Kind = "approve" | "reject" | "execute" | "cancel";
const LABELS: Record<Kind, string> = { approve: "Approve exact request", reject: "Reject request", execute: "Execute authorized action", cancel: "Cancel my request" };

export function RequestActions({ request, me, orgId, now, onDone }: { request: FullRequest; me: Member | null; orgId: string; now: number; onDone: () => void }) {
  const [pending, setPending] = useState<Kind | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = effectiveStatus(request.status, request.expiresAt, now);
  const isRequester = !!me && me.user.id === request.requesterId;
  const alreadyDecided = !!me && request.approvals.some(a => a.approverId === me.user.id);
  const privileged = me?.role === "OWNER" || me?.role === "ADMIN";

  async function run(kind: Kind) {
    setPending(null); setWorking(true); setError(null);
    try {
      await api(`${requestPath(orgId, request.id)}/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Action failed."); }
    finally { setWorking(false); }
  }

  const buttons: Kind[] = [];
  let note: string | null = null;
  if (status === "PENDING") {
    if (isRequester) { buttons.push("cancel"); note = "You created this request. Self-approval is forbidden, so you cannot approve or reject it."; }
    else if (alreadyDecided) note = "You have already recorded a decision on this request.";
    else if (!privileged) note = "Only eligible owners/admins can decide on this request.";
    else buttons.push("approve", "reject");
  } else if (status === "AUTHORIZED") buttons.push("execute");
  else if (status === "EXPIRED") note = "This request expired. Submit a new request to try again.";

  return <div style={{ display: "grid", gap: 8 }}>
    {note && <p className={styles.note}>{note}</p>}
    {buttons.length > 0 && <div className={styles.actions}>{buttons.map(kind => <button key={kind} type="button" disabled={working} className={kind === "approve" || kind === "execute" ? "button" : "secondary-button"} onClick={() => setPending(kind)}>{working ? "Working…" : LABELS[kind]}</button>)}</div>}
    {error && <p className={styles.error} role="alert">Server error: {error}</p>}
    <ConfirmDialog open={pending !== null} title={pending ? `${LABELS[pending]}?` : ""} confirmLabel={pending ? `Yes, ${pending}` : "Confirm"} onCancel={() => setPending(null)} onConfirm={() => pending && void run(pending)}
      body={<><p>{operationLabel(request.operationType)} — target <code>{request.targetId}</code></p><p>Payload digest:</p><code className={styles.digest}>{request.payloadDigest}</code><p className={styles.note}>This decision is bound to this exact payload and recorded in the audit log.</p></>} />
  </div>;
}
