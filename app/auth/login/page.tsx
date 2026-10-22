"use client";

import { useTideCloak } from "@tidecloak/nextjs";

export default function LoginPage() {
  const enabled = process.env.NEXT_PUBLIC_AUTH_MODE === "tidecloak";

  if (!enabled) {
    return <main className="auth-page"><div className="auth-card"><span className="overline">Local development</span><h1>TideCloak is not enabled.</h1><p>Configure the TideCloak environment variables and set NEXT_PUBLIC_AUTH_MODE=tidecloak to use live authentication.</p><a className="button" href="/">Return home <span>→</span></a></div></main>;
  }

  return <TideLogin />;
}

function TideLogin() {
  const auth = useTideCloak();
  return <main className="auth-page"><div className="auth-card"><span className="overline">BusinessVault access</span><h1>Sign in securely.</h1><p>Authentication is handled by your configured TideCloak realm.</p><button className="button" onClick={() => auth.login()}>Continue with TideCloak <span>↗</span></button></div></main>;
}
