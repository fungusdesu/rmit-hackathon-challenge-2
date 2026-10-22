"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ALLOWED_CONTENT_TYPES, CLASSIFICATIONS, type Classification, type DocumentMetadata } from "@/lib/vault/contracts";
import { createVaultApi, type Organization } from "@/lib/vault/client/api";
import type { VaultCipher } from "@/lib/vault/client/cipher";
import { checkFile, decryptDocument, decryptName, uploadFile } from "@/lib/vault/client/vault-flow";
import { errorMessage } from "./errors";
import styles from "./vault.module.css";

export const DEV_USERS = [
  { subject: "dev-alice", name: "Alice (dev)" },
  { subject: "dev-bob", name: "Bob (dev)" },
  { subject: "dev-mallory", name: "Mallory (dev)" },
];

type Props = {
  mode: "tide" | "demo";
  cipher: VaultCipher | null;
  getToken?: () => Promise<string | null>;
  roles?: { encrypt: boolean; decrypt: boolean };
  devUser?: { subject: string; name: string } | null;
  onDevUserChange?: (subject: string) => void;
};

type Notice = { kind: "ok" | "error" | "busy"; text: string } | null;

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1048576).toFixed(2)} MiB`);

export function VaultWorkspace({ mode, cipher, getToken, roles, devUser, onDevUserChange }: Props) {
  const api = useMemo(() => createVaultApi({ getToken, devUser }), [getToken, devUser]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState("");
  const [docs, setDocs] = useState<DocumentMetadata[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [file, setFile] = useState<File | null>(null);
  const [classification, setClassification] = useState<Classification>("INTERNAL");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let live = true;
    api.listOrganizations().then(({ organizations }) => {
      if (!live) return;
      setOrgs(organizations);
      setOrgId((cur) => (organizations.some((o) => o.id === cur) ? cur : organizations[0]?.id ?? ""));
    }).catch((e) => live && setNotice({ kind: "error", text: errorMessage(e) }));
    return () => { live = false; };
  }, [api]);

  const refresh = useCallback(async () => {
    if (!orgId) { setDocs([]); return; }
    try { setDocs((await api.listDocuments(orgId)).documents); } catch (e) { setNotice({ kind: "error", text: errorMessage(e) }); }
  }, [api, orgId]);

  useEffect(() => { setNames({}); void refresh(); }, [refresh]);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!cipher || !file || !orgId) return;
    try { checkFile(file); } catch (err) { setNotice({ kind: "error", text: errorMessage(err) }); return; }
    setUploading(true);
    setNotice({ kind: "busy", text: "Encrypting in your browser and uploading ciphertext…" });
    try {
      await uploadFile(cipher, api, orgId, file, classification);
      setNotice({ kind: "ok", text: "Uploaded. Only ciphertext left this browser." });
      setFile(null);
      (e.target as HTMLFormElement).reset();
      await refresh();
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err) });
    } finally { setUploading(false); }
  }

  async function onDecryptName(doc: DocumentMetadata) {
    if (!cipher) return;
    setBusyId(doc.id);
    try { const n = await decryptName(cipher, doc); setNames((m) => ({ ...m, [doc.id]: n })); setNotice(null); }
    catch (err) { setNotice({ kind: "error", text: errorMessage(err) }); }
    finally { setBusyId(null); }
  }

  async function onSave(doc: DocumentMetadata) {
    if (!cipher) return;
    setBusyId(doc.id);
    setNotice({ kind: "busy", text: "Fetching ciphertext, verifying hash and decrypting in your browser…" });
    try {
      const name = names[doc.id] ?? (await decryptName(cipher, doc));
      setNames((m) => ({ ...m, [doc.id]: name }));
      const blob = await decryptDocument(cipher, api, orgId, doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice({ kind: "ok", text: "Decrypted and saved." });
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err) });
    } finally { setBusyId(null); }
  }

  const statusClass = (s: DocumentMetadata["status"]) => (s === "AVAILABLE" ? styles.ok : s === "REJECTED" ? styles.bad : styles.warn);

  return (
    <div className={styles.vault}>
      {mode === "demo" ? (
        <div className={styles.demoBanner} role="alert"><strong>DEMO — NOT END-TO-END ENCRYPTED.</strong> Development mode uses a browser-local AES key. Do not store real data.</div>
      ) : null}
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Encrypted storage</p>
          <h1>Vault</h1>
        </div>
        <div className={styles.headerMeta}>
          <span className={mode === "tide" ? `${styles.badge} ${styles.ok}` : `${styles.badge} ${styles.bad}`}>{mode === "tide" ? "Tide E2EE" : "Demo cipher (not E2EE)"}</span>
          <Link className={styles.link} href="/dashboard/vault/diagnostics">Diagnostics</Link>
        </div>
      </header>

      <section className={styles.panel} aria-label="Session">
        <div className={styles.row}>
          <label className={styles.field}>
            <span>Organization</span>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} disabled={!orgs.length}>
              {!orgs.length && <option value="">No organizations</option>}
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          {mode === "demo" && onDevUserChange ? (
            <label className={styles.field}>
              <span>Acting as (dev only)</span>
              <select value={devUser?.subject ?? ""} onChange={(e) => onDevUserChange(e.target.value)}>
                <option value="">Default dev user</option>
                {DEV_USERS.map((u) => <option key={u.subject} value={u.subject}>{u.name}</option>)}
              </select>
            </label>
          ) : null}
          {mode === "tide" && roles ? (
            <div className={styles.roles} aria-label="Tide roles">
              <span className={roles.encrypt ? styles.ok : styles.bad}>Encrypt role: {roles.encrypt ? "granted" : "missing"}</span>
              <span className={roles.decrypt ? styles.ok : styles.bad}>Decrypt role: {roles.decrypt ? "granted" : "missing"}</span>
            </div>
          ) : null}
        </div>
        <p className={styles.note}>Only the uploader can decrypt (Tide self-decrypt); shared org decryption pending Forseti policy support.</p>
      </section>

      <section className={styles.panel} aria-label="Upload">
        <h2>Upload a document</h2>
        <form className={styles.row} onSubmit={onUpload}>
          <label className={styles.field}>
            <span>File (max 5 MiB)</span>
            <input type="file" accept={ALLOWED_CONTENT_TYPES.join(",")} onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
          </label>
          <label className={styles.field}>
            <span>Classification</span>
            <select value={classification} onChange={(e) => setClassification(e.target.value as Classification)}>
              {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <button className={styles.button} type="submit" disabled={!cipher || !file || !orgId || uploading}>{uploading ? "Encrypting…" : "Encrypt & upload"}</button>
        </form>
      </section>

      {notice ? (
        <p className={`${styles.notice} ${notice.kind === "ok" ? styles.ok : notice.kind === "error" ? styles.bad : styles.warn}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.kind === "ok" ? "Success: " : notice.kind === "error" ? "Error: " : "Working: "}{notice.text}
        </p>
      ) : null}

      <section className={styles.panel} aria-label="Documents">
        <div className={styles.row}><h2>Documents</h2><button className={styles.ghost} type="button" onClick={() => void refresh()}>Refresh</button></div>
        {docs.length === 0 ? <p className={styles.note}>No documents yet.</p> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Name</th><th>Classification</th><th>Size</th><th>Uploader</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>{names[d.id] ?? <span className={styles.muted}>Encrypted name</span>}</td>
                    <td className={styles.mono}>{d.classification}</td>
                    <td className={styles.mono}>{fmtSize(d.size)}</td>
                    <td>{d.ownerDisplayName}</td>
                    <td><span className={`${styles.badge} ${statusClass(d.status)}`}>{d.status.replace("_", " ").toLowerCase()}</span></td>
                    <td className={styles.mono}>{new Date(d.committedAt ?? d.createdAt).toLocaleString()}</td>
                    <td className={styles.actions}>
                      <button className={styles.ghost} type="button" disabled={!cipher || busyId === d.id || !!names[d.id]} onClick={() => void onDecryptName(d)}>Decrypt name</button>
                      <button className={styles.button} type="button" disabled={!cipher || busyId === d.id || d.status !== "AVAILABLE"} onClick={() => void onSave(d)}>Decrypt & save</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
