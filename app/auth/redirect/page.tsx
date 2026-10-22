"use client";

import { useEffect } from "react";
import { useTideCloak } from "@tidecloak/nextjs";

export default function AuthRedirectPage() {
  if (process.env.NEXT_PUBLIC_AUTH_MODE !== "tidecloak") {
    return <main className="auth-page"><div className="auth-card"><span className="overline">TideCloak</span><h1>Authentication is not enabled.</h1><p>Configure the TideCloak environment variables to use this callback.</p></div></main>;
  }

  return <TideRedirect />;
}

function TideRedirect() {
  const { authenticated, isInitializing, initError, logout } = useTideCloak();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "failed") {
      void logout().finally(() => window.location.replace("/auth/login?error=authentication_failed"));
      return;
    }

    if (initError) {
      window.location.replace("/auth/login?error=initialization_failed");
      return;
    }

    if (!isInitializing) {
      window.location.replace(authenticated ? "/dashboard" : "/auth/login");
      return;
    }

    // If the provider callback event was consumed before React subscribed, use
    // the server-verified cookie as the source of truth instead of hanging here.
    const fallback = window.setTimeout(async () => {
      const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" }).catch(() => null);
      window.location.replace(response?.ok ? "/dashboard" : "/auth/login?error=session_not_established");
    }, 8000);

    return () => window.clearTimeout(fallback);
  }, [authenticated, initError, isInitializing, logout]);

  return <main className="auth-page"><div className="auth-card"><span className="overline">TideCloak</span><h1>Completing secure sign in.</h1><p>Verifying your session and loading BusinessVault.</p></div></main>;
}
