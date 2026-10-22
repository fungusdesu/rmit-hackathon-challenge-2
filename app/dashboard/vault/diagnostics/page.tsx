"use client";

import Link from "next/link";
import { useState } from "react";
import { TIDE_VAULT_ROLES, VAULT_ENCRYPTION_TAG } from "@/lib/vault/contracts";
import { fromBase64, toBase64 } from "@/lib/vault/client/bytes";
import { frameTideOutput } from "@/lib/vault/client/tide-cipher";
import { describeOutput, errorText, toMarkdown, type DiagResult, type DiagRow } from "@/lib/vault/client/diagnostics";
import { IS_TIDE, useTideEnv } from "../use-vault-env";
import styles from "../vault.module.css";

// Realm test panel: talks only to Tide via the SDK; sends nothing to our server.
const tags = [VAULT_ENCRYPTION_TAG];

function randomBytes(n: number) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
  return out;
}

const equalBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
const asBytes = (v: unknown) => (v instanceof Uint8Array ? v : typeof v === "string" ? new TextEncoder().encode(v) : new Uint8Array());

type Outcome = { ok: boolean; types: string[]; detail?: string };

function Diagnostics() {
  const env = useTideEnv();
  const actor = env.username ?? env.subject ?? "unknown";
  const [rows, setRows] = useState<DiagRow[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [exported, setExported] = useState("");
  const [pasted, setPasted] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [copied, setCopied] = useState("");

  async function run(test: string, fn: () => Promise<Outcome>) {
    setRunning(test);
    const t = performance.now();
    let row: DiagRow;
    try {
      const o = await fn();
      row = { actor, test, result: (o.ok ? "PASS" : "FAIL") as DiagResult, ms: performance.now() - t, outputTypes: o.types.join(" / "), error: o.detail ?? "" };
    } catch (e) {
      row = { actor, test, result: "ERROR", ms: performance.now() - t, outputTypes: "-", error: errorText(e) };
    }
    setRows((r) => [...r, row]);
    setRunning(null);
  }

  const roundTripString = () => run("encrypt + decrypt short string", async () => {
    const input = "businessvault diagnostics";
    const [ct] = (await env.raw.doEncrypt([{ data: input, tags }])) as unknown[];
    const [pt] = (await env.raw.doDecrypt([{ encrypted: ct, tags }])) as unknown[];
    const text = typeof pt === "string" ? pt : new TextDecoder().decode(asBytes(pt));
    return { ok: text === input, types: [`enc ${describeOutput(ct)}`, `dec ${describeOutput(pt)}`], detail: text === input ? undefined : "decrypted string differs" };
  });

  const roundTripBytes = (mib: number) => run(`${mib} MiB bytes round-trip`, async () => {
    const input = randomBytes(mib * 1024 * 1024);
    const [ct] = (await env.raw.doEncrypt([{ data: input, tags }])) as unknown[];
    const [pt] = (await env.raw.doDecrypt([{ encrypted: ct, tags }])) as unknown[];
    const ok = equalBytes(asBytes(pt), input);
    return { ok, types: [`enc ${describeOutput(ct)}`, `dec ${describeOutput(pt)}`], detail: ok ? undefined : "decrypted bytes differ" };
  });

  const encryptOnly = () => run("encrypt only", async () => {
    const [ct] = (await env.raw.doEncrypt([{ data: "encrypt permission probe", tags }])) as unknown[];
    return { ok: ct !== undefined, types: [`enc ${describeOutput(ct)}`] };
  });

  const exportCt = () => run("export ciphertext", async () => {
    const [ct] = (await env.raw.doEncrypt([{ data: `exported by ${actor} at ${new Date().toISOString()}`, tags }])) as (string | Uint8Array)[];
    setExported(toBase64(frameTideOutput(ct)));
    return { ok: true, types: [`enc ${describeOutput(ct)}`] };
  });

  const decryptPasted = () => run("decrypt ciphertext exported by another user", async () => {
    setPastedText("");
    const bytes = await env.cipher.decryptBytes(fromBase64(pasted.trim()));
    setPastedText(new TextDecoder().decode(bytes));
    return { ok: true, types: [`dec Uint8Array(${bytes.length})`] };
  });

  async function copyMarkdown() {
    const md = toMarkdown(rows);
    try { await navigator.clipboard.writeText(md); setCopied("Copied Markdown table to clipboard."); }
    catch { setCopied("Clipboard unavailable: select the table below and copy it."); }
  }

  const busy = running !== null;
  const btn = (label: string, onClick: () => void, disabled = false) => (
    <button className={styles.button} type="button" disabled={busy || disabled} onClick={onClick} aria-busy={running === label}>{running === label ? "Running…" : label}</button>
  );

  return (
    <div className={styles.vault}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>Vault · Tide realm test</p><h1>Diagnostics</h1></div>
        <Link className={styles.link} href="/dashboard/vault">Back to vault</Link>
      </header>
      <section className={styles.panel} aria-label="Identity">
        <div className={styles.identity}>
          <span className={styles.eyebrow}>Signed in as</span>
          <strong className={styles.username}>{env.username ?? "(no preferred_username)"}</strong>
        </div>
        <div className={styles.roles}>
          <span className={env.authenticated ? styles.ok : styles.bad}>{env.authenticated ? "✓" : "✗"} authenticated: {String(env.authenticated)}</span>
          <span className={env.roles.encrypt ? styles.ok : styles.bad}>{env.roles.encrypt ? "✓" : "✗"} {TIDE_VAULT_ROLES.encrypt}: {String(env.roles.encrypt)}</span>
          <span className={env.roles.decrypt ? styles.ok : styles.bad}>{env.roles.decrypt ? "✓" : "✗"} {TIDE_VAULT_ROLES.decrypt}: {String(env.roles.decrypt)}</span>
        </div>
        <p className={styles.note}>This page talks only to the Tide network through the SDK. Nothing is sent to the BusinessVault server.</p>
      </section>
      <section className={styles.panel} aria-label="Round-trip tests">
        <h2>Tests (run each individually)</h2>
        <div className={styles.actions}>
          {btn("encrypt + decrypt short string", () => void roundTripString())}
          {btn("1 MiB bytes round-trip", () => void roundTripBytes(1))}
          {btn("5 MiB bytes round-trip", () => void roundTripBytes(5))}
          {btn("encrypt only", () => void encryptOnly())}
        </div>
      </section>
      <section className={styles.panel} aria-label="Cross-user test">
        <h2>Cross-user decrypt test</h2>
        <div className={styles.actions}>{btn("export ciphertext", () => void exportCt())}</div>
        <label className={styles.field}><span>Exported framed ciphertext (base64): copy and give to another user</span><textarea className={styles.textarea} readOnly value={exported} /></label>
        <label className={styles.field}><span>Paste ciphertext from another user</span><textarea className={styles.textarea} value={pasted} onChange={(e) => setPasted(e.target.value)} /></label>
        <div className={styles.actions}>{btn("decrypt ciphertext exported by another user", () => void decryptPasted(), !pasted.trim())}</div>
        {pastedText ? <p className={`${styles.notice} ${styles.ok}`} role="status">Decrypted text: {pastedText}</p> : null}
      </section>
      <section className={styles.panel} aria-label="Results">
        <div className={styles.row}>
          <h2>Results</h2>
          <div className={styles.actions}>
            <button className={styles.button} type="button" disabled={!rows.length} onClick={() => void copyMarkdown()}>Copy results as Markdown</button>
            <button className={styles.ghost} type="button" onClick={() => { setRows([]); setCopied(""); }}>Clear</button>
          </div>
        </div>
        {copied ? <p className={styles.note} role="status">{copied}</p> : null}
        {rows.length === 0 ? <p className={styles.note}>No runs yet.</p> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Actor</th><th>Test</th><th>Result</th><th>ms</th><th>Output types</th><th>Error</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.actor}</td><td>{r.test}</td>
                    <td><span className={`${styles.badge} ${r.result === "PASS" ? styles.ok : styles.bad}`}>{r.result === "PASS" ? "✓ " : "✗ "}{r.result}</span></td>
                    <td className={styles.mono}>{r.ms === null ? "-" : Math.round(r.ms)}</td>
                    <td className={styles.mono}>{r.outputTypes}</td>
                    <td className={styles.mono}>{r.error || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <pre className={styles.pre} aria-label="Markdown preview">{rows.length ? toMarkdown(rows) : ""}</pre>
      </section>
    </div>
  );
}

export default function DiagnosticsPage() {
  if (!IS_TIDE) return <div className={styles.vault}><p className={`${styles.notice} ${styles.warn}`} role="status">Diagnostics unavailable: this panel tests the Tide realm and needs NEXT_PUBLIC_AUTH_MODE=tidecloak. <Link className={styles.link} href="/dashboard/vault">Back to vault</Link></p></div>;
  return <Diagnostics />;
}
