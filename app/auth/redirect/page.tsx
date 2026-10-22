"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTideCloak } from "@tidecloak/nextjs";

export default function AuthRedirectPage() {
  if (process.env.NEXT_PUBLIC_AUTH_MODE !== "tidecloak") {
    return <main className="auth-page"><div className="auth-card"><span className="overline">TideCloak</span><h1>Authentication is not enabled.</h1><p>Configure the TideCloak environment variables to use this callback.</p></div></main>;
  }

  return <TideRedirect />;
}

function TideRedirect() {
  const router = useRouter();
  const { authenticated, isInitializing, logout } = useTideCloak();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "failed") {
      logout();
      return;
    }
    if (!isInitializing) router.replace(authenticated ? "/dashboard" : "/auth/login");
  }, [authenticated, isInitializing, logout, router]);

  return <main className="auth-page"><div className="auth-card"><span className="overline">TideCloak</span><h1>Completing secure sign in.</h1><p>Verifying your session and loading BusinessVault.</p></div></main>;
}
