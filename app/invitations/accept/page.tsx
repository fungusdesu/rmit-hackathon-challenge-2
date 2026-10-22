"use client";

import { useEffect, useState } from "react";

export default function AcceptInvitationPage() {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("Sign in with the invited email address, then accept the invitation.");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setToken(new URLSearchParams(window.location.hash.slice(1)).get("token") ?? ""); }, []);

  async function accept() {
    setBusy(true);
    try {
      const response = await fetch("/api/invitations/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? result.error);
      window.history.replaceState(null, "", "/invitations/accept");
      setToken("");
      setMessage("Invitation accepted. You can open your workspace now.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not accept invitation"); }
    finally { setBusy(false); }
  }

  return <main className="auth-page"><div className="auth-card"><span className="overline">BusinessVault</span><h1>Accept invitation</h1><p>{message}</p><button type="button" disabled={!token || busy} onClick={accept}>{busy ? "Accepting…" : "Accept invitation"}</button><p><a href="/auth/login">Sign in</a> · <a href="/dashboard">Open workspace</a></p></div></main>;
}
