"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTideCloak } from "@tidecloak/nextjs";
import Icon from "../../components/ui-icon";
import { SIM_USERS } from "@/lib/auth/sim/realm";

const ERROR_MESSAGES: Record<string, string> = {
  authentication_failed: "Authentication was cancelled or could not be completed. Please try again.",
  initialization_failed: "Could not initialize the TideCloak security enclave. Check your realm connection.",
  session_not_established: "Your session could not be verified with the server. Please sign in again.",
};

export default function LoginPage() {
  const enabled = process.env.NEXT_PUBLIC_AUTH_MODE === "tidecloak";
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setErrorCode(params.get("error"));
  }, []);

  if (process.env.NEXT_PUBLIC_AUTH_MODE === "tidecloak-sim") {
    return <SimTideLogin errorCode={errorCode} />;
  }

  if (!enabled) {
    return <DevLogin errorCode={errorCode} />;
  }

  return <TideLogin errorCode={errorCode} />;
}

function AuthShell({
  badge,
  title,
  subtitle,
  errorCode,
  children,
}: {
  badge: string;
  title: string;
  subtitle: string;
  errorCode: string | null;
  children: React.ReactNode;
}) {
  const errorText = errorCode ? (ERROR_MESSAGES[errorCode] ?? "Unable to complete sign in. Please try again.") : null;

  return (
    <main className="auth-page">
      <div className="auth-ambient" aria-hidden="true" />
      <div className="auth-card">
        <div className="auth-card-top">
          <Link className="brand auth-brand" href="/">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
            </span>
            <span>BusinessVault</span>
          </Link>
          <span className="auth-badge">
            <span className="pulse-dot" aria-hidden="true" />
            {badge}
          </span>
        </div>

        <div className="auth-header">
          <span className="overline">BusinessVault access</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        {errorText && (
          <div className="auth-alert" role="alert">
            <Icon name="shield" size={16} />
            <span>{errorText}</span>
          </div>
        )}

        {children}

        <div className="auth-trust-row" aria-label="Security guarantees">
          <span>
            <Icon name="shield" size={14} /> Zero-knowledge keys
          </span>
          <span>
            <Icon name="key" size={14} /> Threshold enclave
          </span>
          <span>
            <Icon name="check" size={14} /> Audited sessions
          </span>
        </div>
      </div>
    </main>
  );
}

function TideLogin({ errorCode }: { errorCode: string | null }) {
  const auth = useTideCloak();
  const [busyAction, setBusyAction] = useState<"login" | "create" | null>(null);

  async function handleContinue() {
    setBusyAction("login");
    try {
      await auth.login();
    } catch {
      setBusyAction(null);
    }
  }

  async function handleCreateAccount() {
    setBusyAction("create");
    try {
      const tc = (auth.IAMService as { _tc?: { login?: (opts?: Record<string, unknown>) => Promise<void> } } | undefined)?._tc;
      const cfg = auth.getConfig?.() ?? {};
      const redirectUri =
        (typeof cfg.redirectUri === "string" && cfg.redirectUri) ||
        process.env.NEXT_PUBLIC_TIDECLOAK_REDIRECT_URI ||
        `${window.location.origin}/auth/redirect`;

      if (tc && typeof tc.login === "function") {
        await tc.login({ prompt: "login", redirectUri });
      } else {
        await auth.login();
      }
    } catch {
      setBusyAction(null);
    }
  }

  return (
    <AuthShell
      badge="TideCloak Enclave"
      title="Sign in securely."
      subtitle="Authentication and zero-knowledge key custody are handled by your configured TideCloak realm."
      errorCode={errorCode}
    >
      <div className="auth-actions">
        <button
          className="button auth-primary-button"
          type="button"
          disabled={busyAction !== null}
          onClick={() => void handleContinue()}
        >
          <span>{busyAction === "login" ? "Connecting to TideCloak…" : "Continue with TideCloak"}</span>
          <span className="button-glyph" aria-hidden="true">↗</span>
        </button>

        <div className="auth-divider" role="separator" aria-label="or">
          <span>New to BusinessVault?</span>
        </div>

        <button
          className="auth-secondary-button"
          type="button"
          disabled={busyAction !== null}
          onClick={() => void handleCreateAccount()}
        >
          <Icon name="members" size={16} />
          <span>{busyAction === "create" ? "Opening Tide enclave…" : "Create account"}</span>
          <span className="button-glyph" aria-hidden="true">→</span>
        </button>
      </div>

      <div className="auth-footer-links">
        <Link href="/">← Return home</Link>
        <Link href="/invitations/accept">Have an invite token?</Link>
      </div>
    </AuthShell>
  );
}

function SimTideLogin({ errorCode }: { errorCode: string | null }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(username: string) {
    setBusy(username);
    setError(null);
    try {
      const res = await fetch("/api/auth/sim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? data.error ?? `Sign-in failed (${res.status}).`);
      window.sessionStorage.removeItem("businessvault-organization");
      window.location.assign("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
      setBusy(null);
    }
  }

  return (
    <AuthShell
      badge="TideCloak · simulated"
      title="Sign in with Tide."
      subtitle="Choose a realm account. A local stand-in for TideCloak issues a signed token with Tide's claims and roles, and the server verifies it exactly as it would a live realm's."
      errorCode={errorCode}
    >
      <ul className="sim-accounts" aria-label="Realm accounts">
        {SIM_USERS.map(user => (
          <li key={user.username}>
            <button type="button" className="sim-account" disabled={busy !== null} onClick={() => void signIn(user.username)}>
              <span className="sim-avatar" aria-hidden="true">{user.name[0]}</span>
              <span className="sim-account-text">
                <strong>{busy === user.username ? "Signing in…" : user.name}</strong>
                <small>{user.hint}</small>
              </span>
              <span className="sim-roles">
                {user.realmRoles.length ? user.realmRoles.map(role => <code key={role}>{role}</code>) : <code className="sim-role-missing">no realm roles</code>}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <div className="auth-alert" role="alert">
          <Icon name="shield" size={16} />
          <span>{error}</span>
        </div>
      )}

      <p className="sim-note">Simulation: no Tide enclave or threshold cryptography runs here. Set AUTH_MODE=tidecloak to use the live realm.</p>

      <div className="auth-footer-links">
        <a className="auth-return-link" href="/">
          Return home <span aria-hidden="true">→</span>
        </a>
        <Link href="/invitations/accept">Accept invitation</Link>
      </div>
    </AuthShell>
  );
}

function DevLogin({ errorCode }: { errorCode: string | null }) {
  return (
    <AuthShell
      badge="Local development"
      title="TideCloak is not enabled."
      subtitle="Configure the TideCloak environment variables and set NEXT_PUBLIC_AUTH_MODE=tidecloak to use live enclave authentication, or continue in local development mode."
      errorCode={errorCode}
    >
      <div className="auth-actions">
        <Link className="button auth-primary-button" href="/dashboard">
          <span>Continue with TideCloak</span>
          <span className="button-glyph" aria-hidden="true">↗</span>
        </Link>

        <div className="auth-divider" role="separator" aria-label="or">
          <span>New to BusinessVault?</span>
        </div>

        <Link className="auth-secondary-button" href="/dashboard">
          <Icon name="members" size={16} />
          <span>Create account</span>
          <span className="button-glyph" aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="auth-footer-links">
        <a className="auth-return-link" href="/">
          Return home <span aria-hidden="true">→</span>
        </a>
        <Link href="/invitations/accept">Accept invitation</Link>
      </div>
    </AuthShell>
  );
}
