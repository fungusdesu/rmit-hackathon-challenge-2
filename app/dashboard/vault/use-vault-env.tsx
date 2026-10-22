"use client";

import { useTideCloak } from "@tidecloak/nextjs";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { TIDE_VAULT_ROLES } from "@/lib/vault/contracts";
import type { VaultCipher } from "@/lib/vault/client/cipher";
import { createTideVaultCipher } from "@/lib/vault/client/tide-cipher";

export const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE;
export const IS_TIDE = AUTH_MODE === "tidecloak";
export const IS_DEV = AUTH_MODE === "development";

export type TideEnv = {
  ready: boolean;
  authenticated: boolean;
  cipher: VaultCipher;
  getToken: () => Promise<string | null>;
  roles: { encrypt: boolean; decrypt: boolean };
  subject: string | null;
  username: string | null;
  raw: { doEncrypt: (d: unknown) => Promise<unknown>; doDecrypt: (d: unknown) => Promise<unknown> };
};

// Only call inside TideCloakProvider (i.e. when IS_TIDE).
export function useTideEnv(): TideEnv {
  const tc = useTideCloak();
  const tcRef = useRef(tc);
  useEffect(() => { tcRef.current = tc; });
  // Stable identity so the API client is not rebuilt every render.
  // Refresh first (this also rewrites the kcToken cookie the proxy reads), then send as Bearer.
  const getToken = useCallback(async () => {
    try { await tcRef.current.refreshToken(); } catch { /* fall back to the current token */ }
    return tcRef.current.getToken();
  }, []);
  const cipher = useMemo(() => createTideVaultCipher({ doEncrypt: (d) => tc.doEncrypt(d), doDecrypt: (d) => tc.doDecrypt(d) }), [tc]);
  let subject: string | null = null;
  try { subject = tc.authenticated ? (tc.getValueFromToken("sub") as string | null) ?? null : null; } catch { subject = null; }
  let username: string | null = null;
  try { const u: unknown = tc.authenticated ? tc.getValueFromToken("preferred_username") : null; username = typeof u === "string" ? u : null; } catch { username = null; }
  const has = (r: string) => { try { return tc.authenticated && tc.hasRealmRole(r); } catch { return false; } };
  return {
    ready: !tc.isInitializing,
    authenticated: tc.authenticated,
    cipher,
    getToken,
    roles: { encrypt: has(TIDE_VAULT_ROLES.encrypt), decrypt: has(TIDE_VAULT_ROLES.decrypt) },
    subject,
    username,
    raw: { doEncrypt: (d) => tc.doEncrypt(d), doDecrypt: (d) => tc.doDecrypt(d) },
  };
}
