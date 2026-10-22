"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useWorkspace } from "../use-workspace";
import styles from "./members.module.css";
import {
  ApiError, ROLES, buildMemberChangeRequest, buildPrivilegedInviteRequest, callApi, invitationNeedsRequest,
  invitationStatus, isPrivilegedRole, memberChangePath, quorumSummary, validReason, type Role, type Status,
} from "./members-logic";

type Member = { id: string; role: Role; status: Status; joinedAt: string | null; user: { id: string; displayName: string; email: string | null } };
type Invitation = { id: string; email: string; invitedRole: Role; expiresAt: string; acceptedAt: string | null; revokedAt: string | null; createdAt: string };
type Policy = { operationType: string; requiredApprovals: number };
type Notice = { kind: "error" | "ok"; text: string; approvals?: boolean };

function errText(cause: unknown) {
  if (cause instanceof ApiError) return `${cause.code} (${cause.status}): ${cause.message}`;
  return cause instanceof Error ? cause.message : "Request failed.";
}
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

export default function MembersPage() {
  const ws = useWorkspace();
  const orgId = ws.organizationId;
  const base = orgId ? `/api/organizations/${encodeURIComponent(orgId)}` : "";
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [invError, setInvError] = useState<string | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [inviteReason, setInviteReason] = useState("");
  const [editing, setEditing] = useState<{ member: Member; action: "role" | "suspend" | "reactivate" | "remove"; role: Role; reason: string } | null>(null);

  const load = useCallback(async () => {
    if (!base) return;
    setLoadError(null);
    try {
      const data = await callApi<{ members: Member[] }>(`${base}/members`);
      setMembers(data.members);
    } catch (cause) { setLoadError(errText(cause)); }
    try {
      const data = await callApi<{ invitations: Invitation[] }>(`${base}/invitations`);
      setInvitations(data.invitations); setInvError(null);
    } catch (cause) { setInvitations(null); setInvError(errText(cause)); }
    try {
      const data = await callApi<{ policies: Policy[] }>(`${base}/policies`);
      setPolicies(data.policies ?? []);
    } catch { setPolicies([]); }
  }, [base]);

  useEffect(() => { void load(); }, [load]);

  const owners = members.filter(m => m.role === "OWNER" && m.status === "ACTIVE").length;
  const removeOwnerPolicy = policies.find(p => p.operationType === "REMOVE_OWNER");
  const quorum = quorumSummary(owners, removeOwnerPolicy?.requiredApprovals ?? null);
  const setupStatus = ws.organization?.setupStatus ?? "";
  const inviteGoverned = invitationNeedsRequest(role, setupStatus, setupStatus === "INITIALIZING" ? "OWNER" : null);

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!base) return;
    setNotice(null); setLink(null); setCopied(false);
    if (inviteGoverned && !validReason(inviteReason)) { setNotice({ kind: "error", text: "invalid_reason: a reason of 5-1000 characters is required for privileged invitations." }); return; }
    setBusy(true);
    try {
      if (!inviteGoverned) {
        const data = await callApi<{ acceptanceUrl?: string }>(`${base}/invitations`, { method: "POST", body: JSON.stringify({ email: email.trim(), role }) });
        if (data.acceptanceUrl) setLink(data.acceptanceUrl);
        setNotice({ kind: "ok", text: `Invitation created for ${email.trim()} as ${role}.` });
      } else {
        await callApi(`${base}/requests`, { method: "POST", body: JSON.stringify(buildPrivilegedInviteRequest(email, role, inviteReason)) });
        setNotice({ kind: "ok", text: `INVITE_PRIVILEGED_MEMBER request created for ${email.trim()} (${role}). Other owners must approve it before the invitation is issued.`, approvals: true });
      }
      setEmail(""); setInviteReason("");
      await load();
    } catch (cause) { setNotice({ kind: "error", text: errText(cause) }); }
    finally { setBusy(false); }
  }

  async function revoke(inv: Invitation) {
    if (!base || !window.confirm(`Revoke the invitation for ${inv.email}? The link will stop working.`)) return;
    setNotice(null);
    try {
      await callApi(`${base}/invitations/${encodeURIComponent(inv.id)}`, { method: "DELETE" });
      setNotice({ kind: "ok", text: `Invitation for ${inv.email} revoked.` });
      await load();
    } catch (cause) { setNotice({ kind: "error", text: errText(cause) }); }
  }

  async function submitChange(event: FormEvent) {
    event.preventDefault();
    if (!base || !editing) return;
    const { member, action } = editing;
    const change: { role?: Role; status?: Status } =
      action === "role" ? { role: editing.role } : { status: action === "suspend" ? "SUSPENDED" : action === "reactivate" ? "ACTIVE" : "REMOVED" };
    if (!validReason(editing.reason)) { setNotice({ kind: "error", text: "invalid_reason: a reason of 5-1000 characters is required." }); return; }
    if (action === "remove" && !window.confirm(`Remove ${member.user.displayName}?`)) return;
    setBusy(true); setNotice(null);
    try {
      const { path, body } = buildMemberChangeRequest(member.id, member.user.id, member.role, change, editing.reason);
      if (path === "direct") {
        await callApi(`${base}/members/${encodeURIComponent(member.id)}`, { method: "PATCH", body: JSON.stringify(body) });
        setNotice({ kind: "ok", text: `Updated ${member.user.displayName}.` });
      } else {
        await callApi(`${base}/requests`, { method: "POST", body: JSON.stringify(body) });
        setNotice({ kind: "ok", text: `${path} request created for ${member.user.displayName}. It takes effect after owner quorum approves it.`, approvals: true });
      }
      setEditing(null);
      await load();
    } catch (cause) { setNotice({ kind: "error", text: errText(cause) }); }
    finally { setBusy(false); }
  }

  if (ws.loading) return <main className={styles.page}><p>Loading workspace…</p></main>;
  if (ws.error) return <main className={styles.page}><p role="alert" className={styles.error}>{ws.error}</p></main>;
  if (!orgId) return <main className={styles.page}><p>No organization yet. <Link href="/dashboard">Create one from the dashboard.</Link></p></main>;

  const pendingPath = editing ? memberChangePath(editing.member.role, editing.action === "role" ? { role: editing.role } : { status: editing.action === "suspend" ? "SUSPENDED" : editing.action === "reactivate" ? "ACTIVE" : "REMOVED" }) : null;

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>{ws.organization?.name}</p>
          <h1>Members &amp; owners</h1>
          <p className={styles.muted}>Ordinary roles (Member, Auditor) change immediately. Anything that grants, alters or removes Owner/Admin power needs owner quorum, so no single compromised account can seize or strip control.</p>
        </div>
        {ws.organizations.length > 1 && (
          <label className={styles.field}>Organization
            <select value={orgId} onChange={e => ws.selectOrganization(e.target.value)}>
              {ws.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        )}
      </header>

      <section className={quorum.healthy ? styles.callout : `${styles.callout} ${styles.warn}`} aria-live="polite">
        <strong>Owner quorum</strong> {quorum.text}
      </section>

      {notice && (
        <div role={notice.kind === "error" ? "alert" : "status"} className={notice.kind === "error" ? styles.error : styles.ok}>
          {notice.text} {notice.approvals && <Link href="/dashboard/approvals">Open approvals</Link>}
        </div>
      )}
      {loadError && <p role="alert" className={styles.error}>{loadError}</p>}

      <section className={styles.card} aria-labelledby="members-h">
        <h2 id="members-h">Members ({members.length})</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th><span className={styles.sr}>Actions</span></th></tr></thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id}>
                  <td data-label="Name">{m.user.displayName}</td>
                  <td data-label="Email">{m.user.email ?? "—"}</td>
                  <td data-label="Role"><span className={`${styles.badge} ${styles[`role${m.role}`]}`}>{m.role}</span></td>
                  <td data-label="Status"><span className={`${styles.badge} ${m.status === "ACTIVE" ? styles.active : styles.suspended}`}>{m.status}</span></td>
                  <td data-label="Joined">{fmt(m.joinedAt)}</td>
                  <td className={styles.actions}>
                    <button type="button" onClick={() => setEditing({ member: m, action: "role", role: m.role === "MEMBER" ? "AUDITOR" : "MEMBER", reason: "" })}>Change role</button>
                    {m.status === "ACTIVE"
                      ? <button type="button" onClick={() => setEditing({ member: m, action: "suspend", role: m.role, reason: "" })}>Suspend</button>
                      : <button type="button" onClick={() => setEditing({ member: m, action: "reactivate", role: m.role, reason: "" })}>Reactivate</button>}
                    <button type="button" className={styles.danger} onClick={() => setEditing({ member: m, action: "remove", role: m.role, reason: "" })}>Remove</button>
                  </td>
                </tr>
              ))}
              {members.length === 0 && !loadError && <tr><td colSpan={6}>No members visible.</td></tr>}
            </tbody>
          </table>
        </div>

        {editing && (
          <form className={styles.form} onSubmit={submitChange} aria-label={`Change ${editing.member.user.displayName}`}>
            <h3>{editing.action === "role" ? "Change role" : editing.action === "suspend" ? "Suspend" : editing.action === "reactivate" ? "Reactivate" : "Remove"}: {editing.member.user.displayName}</h3>
            {editing.action === "role" && (
              <label className={styles.field}>New role
                <select value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value as Role })}>
                  {ROLES.filter(r => r !== editing.member.role).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            )}
            <label className={styles.field}>Reason (required, 5+ characters)
              <textarea value={editing.reason} onChange={e => setEditing({ ...editing, reason: e.target.value })} rows={2} required minLength={5} maxLength={1000} />
            </label>
            <p className={styles.muted}>
              {pendingPath === "direct" ? "This is an ordinary change and applies immediately."
                : pendingPath === "REMOVE_OWNER" ? "Removing an owner creates a REMOVE_OWNER request. It needs owner quorum and cannot drop the organization below its owner floor."
                : "This touches Owner/Admin privilege, so it creates a CHANGE_PRIVILEGED_MEMBERSHIP request that other owners must approve."}
            </p>
            <div className={styles.row}>
              <button type="submit" disabled={busy}>{pendingPath === "direct" ? "Apply change" : "Create approval request"}</button>
              <button type="button" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        )}
      </section>

      <section className={styles.card} aria-labelledby="inv-h">
        <h2 id="inv-h">Invitations</h2>
        <form className={styles.form} onSubmit={invite}>
          <div className={styles.row}>
            <label className={styles.field}>Email
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" />
            </label>
            <label className={styles.field}>Role
              <select value={role} onChange={e => setRole(e.target.value as Role)}>
                {ROLES.map(r => <option key={r} value={r}>{r}{isPrivilegedRole(r) ? " (needs approval)" : ""}</option>)}
              </select>
            </label>
          </div>
          {inviteGoverned && (
            <>
              <label className={styles.field}>Reason (required for privileged invitations)
                <textarea value={inviteReason} onChange={e => setInviteReason(e.target.value)} rows={2} required minLength={5} maxLength={1000} />
              </label>
              <p className={styles.muted}>Owner and Admin invitations create an INVITE_PRIVILEGED_MEMBER request. The invitation is only issued after quorum approval.</p>
              {setupStatus === "INITIALIZING" && <p className={styles.muted}>This organization is still initializing: governed requests are unavailable until owner quorum is set up. Invite the founding owners first.</p>}
            </>
          )}
          <button type="submit" disabled={busy}>{inviteGoverned ? "Request privileged invitation" : "Send invitation"}</button>
        </form>

        {link && (
          <div className={styles.secret} role="status">
            <p><strong>Shown once.</strong> Copy this invitation link now and send it to the invitee over a trusted channel. It cannot be displayed again.</p>
            <code className={styles.code}>{link}</code>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopied(true)); }}>{copied ? "Copied" : "Copy link"}</button>
          </div>
        )}

        {invError && <p role="alert" className={styles.error}>Invitations unavailable: {invError}</p>}
        {invitations && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Expires</th><th><span className={styles.sr}>Actions</span></th></tr></thead>
              <tbody>
                {invitations.map(inv => {
                  const status = invitationStatus(inv);
                  return (
                    <tr key={inv.id}>
                      <td data-label="Email">{inv.email}</td>
                      <td data-label="Role"><span className={`${styles.badge} ${styles[`role${inv.invitedRole}`]}`}>{inv.invitedRole}</span></td>
                      <td data-label="Status">{status}</td>
                      <td data-label="Expires">{fmt(inv.expiresAt)}</td>
                      <td className={styles.actions}>{status === "PENDING" && <button type="button" className={styles.danger} onClick={() => void revoke(inv)}>Revoke</button>}</td>
                    </tr>
                  );
                })}
                {invitations.length === 0 && <tr><td colSpan={5}>No invitations yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
