"use client";

import { useEffect, useRef } from "react";
import { useTideCloak } from "@tidecloak/nextjs";

export default function LogoutPage() {
  if (process.env.NEXT_PUBLIC_AUTH_MODE !== "tidecloak") {
    return <main className="auth-page"><div className="auth-card"><span className="overline">Local development</span><h1>Development session ended.</h1><p>Live TideCloak logout is available when Tide mode is enabled.</p><a className="button" href="/">Return home <span>→</span></a></div></main>;
  }

  return <TideLogout />;
}

function TideLogout() {
  const { logout } = useTideCloak();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    logout();

    // Tide normally navigates to its end-session endpoint. Do not strand the
    // user if that navigation is blocked or the provider returns no redirect.
    const fallback = window.setTimeout(() => window.location.replace("/"), 1500);
    return () => window.clearTimeout(fallback);
  }, [logout]);

  return <main className="auth-page"><div className="auth-card"><span className="overline">TideCloak</span><h1>Signing you out securely.</h1><p>Ending the BusinessVault session. You will return to the home page automatically.</p><a className="button" href="/">Return home <span>→</span></a></div></main>;
}
