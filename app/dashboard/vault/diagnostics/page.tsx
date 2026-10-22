"use client";

import Link from "next/link";
import { useState } from "react";
import { TIDE_VAULT_ROLES, VAULT_ENCRYPTION_TAG } from "@/lib/vault/contracts";
import { fromBase64, toBase64 } from "@/lib/vault/client/bytes";
import { frameTideOutput } from "@/lib/vault/client/tide-cipher";
import { IS_TIDE, useTideEnv } from "../use-vault-env";
import styles from "../vault.module.css";

// Realm test panel: talks only to Tide via the SDK; sends nothing to our server.
const tags = [VAULT_ENCRYPTION_TAG];
const describe = (v: unknown) => `typeof=${typeof v}, instanceof Uint8Array=${v instanceof Uint8Array}${v instanceof Uint8Array ? `, length=${v.length}` : typeof v === "string" ? `, length=${v.length}` : ""}`;
const sdkError = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : `Non-Error thrown: ${String(e)}`);

function randomBytes(n: number) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
  return out;
}

const equalBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

function Diagnostics() {
  const env = useTideEnv();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState("");
  const [pasted, setPasted] = useState("");
  const add = (line: string) => setLog((l) => [...l, line]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    add(`▶ ${label}`);
    try { await fn(); } catch (e) { add(`✗ FAIL ${label}: ${sdkError(e)}`); } finally { setBusy(false); }
  }

  const roundTripString = () => run("String round-trip", async () => {
    const input = "businessvault diagnostics ✓";
    let t = performance.now();
    const [ct] = (await env.raw.doEncrypt([{ data: input, tags }])) as unknown[];
    add(`encrypt output: ${describe(ct)} in ${(performance.now() - t).toFixed(0)} ms`);
    t = performance.now();
    const [pt] = (await env.raw.doDecrypt([{ encrypted: ct, tags }])) as unknown[];
    add(`decrypt output: ${describe(pt)} in ${(performance.now() - t).toFixed(0)} ms`);
    const text = typeof pt === "string" ? pt : pt instanceof Uint8Array ? new TextDecoder().decode(pt) : "";
    add(text === input ? "✓ PASS string round-trip matches" : "✗ FAIL decrypted string differs");
  });

  const roundTripBytes = (mib: number) => run(`${mib} MiB bytes round-trip`, async () => {
    const input = randomBytes(mib * 1024 * 1024);
    let t = performance.now();
    const [ct] = (await env.raw.doEncrypt([{ data: input, tags }])) as unknown[];
    add(`encrypt output: ${describe(ct)} in ${(performance.now() - t).toFixed(0)} ms`);
    t = performance.now();
    const [pt] = (await env.raw.doDecrypt([{ encrypted: ct, tags }])) as unknown[];
    add(`decrypt output: ${describe(pt)} in ${(performance.now() - t).toFixed(0)} ms`);
    const bytes = pt instanceof Uint8Array ? pt : typeof pt === "string" ? new TextEncoder().encode(pt) : new Uint8Array();
    add(equalBytes(bytes, input) ? "✓ PASS bytes match" : "✗ FAIL decrypted bytes differ");
  });

  const exportCt = () => run("Export ciphertext", async () => {
    const [ct] = (await env.raw.doEncrypt([{ data: `exported by ${env.subject ?? "unknown"} at ${new Date().toISOString()}`, tags }])) as (string | Uint8Array)[];
    setExported(toBase64(frameTideOutput(ct)));
    add(`✓ exported framed ciphertext (${describe(ct)})`);
  });

  const decryptPasted = () => run("Decrypt pasted ciphertext", async () => {
    const text = await env.cipher.decryptBytes(fromBase64(pasted.trim()));
    add(`✓ PASS decrypted pasted ciphertext: "${new TextDecoder().decode(text)}"`);
  });

  return (
    <div className={styles.vault}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>Vault · Tide realm test</p><h1>Diagnostics</h1></div>
        <Link className={styles.link} href="/dashboard/vault">Back to vault</Link>
      </header>
      <section className={styles.panel} aria-label="Identity">
        <p className={styles.note}>This page talks only to the Tide network through the SDK. Nothing is sent to the BusinessVault server.</p>
        <div className={styles.roles}>
          <span className={env.authenticated ? styles.ok : styles.bad}>Authenticated: {String(env.authenticated)}</span>
          <span className={styles.warn}>Subject: {env.subject ?? "unknown"}</span>
          <span className={env.roles.encrypt ? styles.ok : styles.bad}>{TIDE_VAULT_ROLES.encrypt}: {String(env.roles.encrypt)}</span>
          <span className={env.roles.decrypt ? styles.ok : styles.bad}>{TIDE_VAULT_ROLES.decrypt}: {String(env.roles.decrypt)}</span>
        </div>
      </section>
      <section className={styles.panel} aria-label="Round-trip tests">
        <h2>Round-trip tests</h2>
        <div className={styles.actions}>
          <button className={styles.button} type="button" disabled={busy} onClick={() => void roundTripString()}>Short string</button>
          <button className={styles.button} type="button" disabled={busy} onClick={() => void roundTripBytes(1)}>1 MiB bytes</button>
          <button className={styles.button} type="button" disabled={busy} onClick={() => void roundTripBytes(5)}>5 MiB bytes</button>
          <button className={styles.ghost} type="button" onClick={() => setLog([])}>Clear log</button>
        </div>
      </section>
      <section className={styles.panel} aria-label="Cross-user test">
        <h2>Cross-user decrypt test</h2>
        <div className={styles.actions}><button className={styles.button} type="button" disabled={busy} onClick={() => void exportCt()}>Export ciphertext</button></div>
        <label className={styles.field}><span>Exported framed ciphertext (base64) — copy and give to another user</span><textarea className={styles.textarea} readOnly value={exported} /></label>
        <label className={styles.field}><span>Paste ciphertext from another user</span><textarea className={styles.textarea} value={pasted} onChange={(e) => setPasted(e.target.value)} /></label>
        <div className={styles.actions}><button className={styles.button} type="button" disabled={busy || !pasted.trim()} onClick={() => void decryptPasted()}>Try decrypt</button></div>
      </section>
      <section className={styles.panel} aria-label="Log">
        <h2>Log</h2>
        <pre className={styles.pre} role="log" aria-live="polite">{log.length ? log.join("\n") : "No runs yet."}</pre>
      </section>
    </div>
  );
}

export default function DiagnosticsPage() {
  if (!IS_TIDE) return <div className={styles.vault}><p className={`${styles.notice} ${styles.warn}`} role="status">Diagnostics unavailable: this panel tests the Tide realm and needs NEXT_PUBLIC_AUTH_MODE=tidecloak. <Link className={styles.link} href="/dashboard/vault">Back to vault</Link></p></div>;
  return <Diagnostics />;
}
