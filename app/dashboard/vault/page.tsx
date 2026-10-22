"use client";

import { useMemo, useState } from "react";
import { createDemoVaultCipher } from "@/lib/vault/client/demo-cipher";
import { IS_DEV, IS_TIDE, useTideEnv } from "./use-vault-env";
import { DEV_USERS, VaultWorkspace } from "./vault-workspace";
import styles from "./vault.module.css";

function TideVault() {
  const env = useTideEnv();
  if (!env.ready) return <p className={styles.note} role="status">Loading Tide session…</p>;
  if (!env.authenticated) return <p className={`${styles.notice} ${styles.bad}`} role="alert">Error: you are not signed in with Tide. Sign in to use the vault.</p>;
  return <VaultWorkspace mode="tide" cipher={env.cipher} getToken={env.getToken} roles={env.roles} />;
}

function DemoVault() {
  const cipher = useMemo(() => (typeof window === "undefined" ? null : createDemoVaultCipher()), []);
  const [subject, setSubject] = useState("");
  const devUser = useMemo(() => DEV_USERS.find((u) => u.subject === subject) ?? null, [subject]);
  return <VaultWorkspace mode="demo" cipher={cipher} devUser={devUser} onDevUserChange={setSubject} />;
}

export default function VaultPage() {
  if (IS_TIDE) return <TideVault />;
  if (IS_DEV) return <DemoVault />;
  return <p className={`${styles.notice} ${styles.bad}`} role="alert">Error: the vault is unavailable because NEXT_PUBLIC_AUTH_MODE is not configured.</p>;
}
