"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { apiJson, useWorkspace } from "../use-workspace";
import { ASSET_CRITICALITIES, ASSET_PROVIDERS, ASSET_TYPES } from "@/lib/assets/validation";
import styles from "./assets.module.css";

type Asset = {
  id: string; name: string; type: string; provider: string; externalResourceId: string | null; sensitivity: string | null;
  managedMode: string; criticality: string; businessOwner: string | null; custodians: string[]; adminContacts: string[];
  reviewDate: string | null; recoveryPlan: string | null; notes: string | null; reviewOverdue: boolean;
};

type Draft = { name: string; type: string; provider: string; criticality: string; businessOwner: string; custodians: string; adminContacts: string; reviewDate: string; externalResourceId: string; recoveryPlan: string; notes: string };

const emptyDraft: Draft = { name: "", type: "GITHUB_ORG", provider: "GITHUB", criticality: "MEDIUM", businessOwner: "", custodians: "", adminContacts: "", reviewDate: "", externalResourceId: "", recoveryPlan: "", notes: "" };

function toDraft(a: Asset): Draft {
  return { name: a.name, type: a.type, provider: a.provider, criticality: a.criticality, businessOwner: a.businessOwner ?? "", custodians: a.custodians.join(", "), adminContacts: a.adminContacts.join(", "), reviewDate: a.reviewDate ? a.reviewDate.slice(0, 10) : "", externalResourceId: a.externalResourceId ?? "", recoveryPlan: a.recoveryPlan ?? "", notes: a.notes ?? "" };
}

const list = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean);
const label = (s: string) => s.replaceAll("_", " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());

export default function AssetsPage() {
  const workspace = useWorkspace();
  const orgId = workspace.organizationId;
  const base = orgId ? `/api/organizations/${encodeURIComponent(orgId)}/assets` : null;
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState("");
  const [criticality, setCriticality] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [editing, setEditing] = useState<Asset | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!base) return;
    setLoading(true); setError(null);
    try { setAssets((await apiJson<{ assets: Asset[] }>(base)).assets); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load assets."); }
    finally { setLoading(false); }
  }, [base]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => assets.filter(a => (!provider || a.provider === provider) && (!criticality || a.criticality === criticality) && (!overdueOnly || a.reviewOverdue)), [assets, provider, criticality, overdueOnly]);

  function open(target: Asset | "new") {
    setEditing(target); setFormError(null);
    setDraft(target === "new" ? emptyDraft : toDraft(target));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!base || !editing) return;
    setSaving(true); setFormError(null);
    const payload = { name: draft.name, type: draft.type, provider: draft.provider, criticality: draft.criticality, businessOwner: draft.businessOwner || null, custodians: list(draft.custodians), adminContacts: list(draft.adminContacts), reviewDate: draft.reviewDate || null, externalResourceId: draft.externalResourceId || null, recoveryPlan: draft.recoveryPlan || null, notes: draft.notes || null };
    try {
      const url = editing === "new" ? base : `${base}/${encodeURIComponent(editing.id)}`;
      await apiJson(url, { method: editing === "new" ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      setEditing(null);
      await load();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Save failed."); }
    finally { setSaving(false); }
  }

  async function remove(asset: Asset) {
    if (!base) return;
    if (!window.confirm(`Delete inventory record "${asset.name}"? This removes the record only; it does not change anything at ${asset.provider}.`)) return;
    try { await apiJson(`${base}/${encodeURIComponent(asset.id)}`, { method: "DELETE" }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Delete failed."); }
  }

  const set = (key: keyof Draft) => (e: { target: { value: string } }) => setDraft(d => ({ ...d, [key]: e.target.value }));

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1>Asset registry</h1>
        <button type="button" className={styles.button} onClick={() => open("new")} disabled={!orgId}>Add asset</button>
      </div>
      <p className={styles.banner} role="note">Inventory only — BusinessVault does not control provider admin rights</p>
      {workspace.error && <p className={styles.error} role="alert">{workspace.error}</p>}

      <div className={styles.filters} aria-label="Filters">
        <label>Provider<select value={provider} onChange={e => setProvider(e.target.value)}><option value="">All</option>{ASSET_PROVIDERS.map(p => <option key={p} value={p}>{label(p)}</option>)}</select></label>
        <label>Criticality<select value={criticality} onChange={e => setCriticality(e.target.value)}><option value="">All</option>{ASSET_CRITICALITIES.map(c => <option key={c} value={c}>{label(c)}</option>)}</select></label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)} />Review overdue only</label>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading || workspace.loading ? <p aria-live="polite">Loading assets…</p> : visible.length === 0 ? <p>No assets match. Add the accounts and resources your business depends on.</p> : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">Registered assets</caption>
            <thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Provider</th><th scope="col">Criticality</th><th scope="col">Business owner</th><th scope="col">Review</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {visible.map(a => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{label(a.type)}</td>
                  <td>{label(a.provider)}</td>
                  <td><span className={`${styles.badge} ${a.criticality === "CRITICAL" ? styles.critical : a.criticality === "HIGH" ? styles.high : ""}`}>{label(a.criticality)}</span></td>
                  <td>{a.businessOwner ?? "—"}</td>
                  <td>{a.reviewDate ? a.reviewDate.slice(0, 10) : "—"}{a.reviewOverdue && <span className={`${styles.badge} ${styles.overdue}`}>Review overdue</span>}</td>
                  <td className={styles.actions}>
                    <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => open(a)} aria-label={`Edit ${a.name}`}>Edit</button>
                    <button type="button" className={`${styles.button} ${styles.danger}`} onClick={() => remove(a)} disabled={a.criticality === "CRITICAL"} title={a.criticality === "CRITICAL" ? "Critical assets require a quorum operation to delete" : undefined} aria-label={`Delete ${a.name}`}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className={styles.backdrop} onClick={() => setEditing(null)} onKeyDown={e => { if (e.key === "Escape") setEditing(null); }}>
          <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="asset-drawer-title" onClick={e => e.stopPropagation()}>
            <h2 id="asset-drawer-title">{editing === "new" ? "Add asset" : `Edit ${editing.name}`}</h2>
            <form className={styles.form} onSubmit={save}>
              <label>Name<input required minLength={2} maxLength={120} value={draft.name} onChange={set("name")} autoFocus /></label>
              <div className={styles.row}>
                <label>Type<select value={draft.type} onChange={set("type")}>{ASSET_TYPES.map(t => <option key={t} value={t}>{label(t)}</option>)}</select></label>
                <label>Provider<select value={draft.provider} onChange={set("provider")}>{ASSET_PROVIDERS.map(p => <option key={p} value={p}>{label(p)}</option>)}</select></label>
              </div>
              <div className={styles.row}>
                <label>Criticality<select value={draft.criticality} onChange={set("criticality")}>{ASSET_CRITICALITIES.map(c => <option key={c} value={c}>{label(c)}</option>)}</select></label>
                <label>Review date<input type="date" value={draft.reviewDate} onChange={set("reviewDate")} /></label>
              </div>
              <label>External resource ID<input maxLength={300} value={draft.externalResourceId} onChange={set("externalResourceId")} /></label>
              <label>Business owner<input maxLength={200} value={draft.businessOwner} onChange={set("businessOwner")} /></label>
              <label>Custodians (comma separated)<input value={draft.custodians} onChange={set("custodians")} /></label>
              <label>Provider admin contacts (comma separated)<input value={draft.adminContacts} onChange={set("adminContacts")} /></label>
              <label>Recovery plan<textarea rows={3} maxLength={4000} value={draft.recoveryPlan} onChange={set("recoveryPlan")} /></label>
              <label>Notes<textarea rows={3} maxLength={4000} value={draft.notes} onChange={set("notes")} /></label>
              {formError && <p className={styles.error} role="alert">{formError}</p>}
              <div className={styles.actions}>
                <button type="submit" className={styles.button} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </main>
  );
}
