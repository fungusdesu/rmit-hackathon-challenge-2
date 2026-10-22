"use client";

import { useEffect, useState } from "react";
import { SIM_USERS } from "@/lib/auth/sim/realm";

// Development-mode only: switch the dev-auth identity for the whole dashboard (demo filming, multi-user flows).
// The server accepts these cookies only when AUTH_MODE=development and ALLOW_INSECURE_DEV_AUTH=true.
export const DEMO_PERSONAS = [
  { subject: "demo-alice", name: "Alice (owner)", email: "alice@northstar.test" },
  { subject: "demo-bob", name: "Bob (owner)", email: "bob@northstar.test" },
  { subject: "demo-carol", name: "Carol (owner)", email: "carol@northstar.test" },
  { subject: "demo-dave", name: "Dave (member)", email: "dave@northstar.test" },
  { subject: "demo-erin", name: "Erin (auditor)", email: "erin@northstar.test" },
  { subject: "demo-mallory", name: "Mallory (outsider)", email: "mallory@outside.test" },
] as const;

function readCookie(name: string) {
  const match = document.cookie.split("; ").find(part => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax${value ? "" : "; max-age=0"}`;
}

export default function DevUserSwitcher() {
  if (process.env.NEXT_PUBLIC_AUTH_MODE === "tidecloak-sim") return <SimAccountSwitcher />;
  return <DevCookieSwitcher />;
}

// Simulated TideCloak: switching account is a fresh sign-in, so the new token carries that user's roles.
function SimAccountSwitcher() {
  const [current, setCurrent] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" }).then(res => res.json()).then((data: { principal?: { subject?: string } }) => {
      setCurrent(SIM_USERS.find(user => user.subject === data.principal?.subject)?.username ?? "");
    }).catch(() => undefined);
  }, []);

  async function change(username: string) {
    setError(null);
    const res = await fetch("/api/auth/sim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username }) });
    if (!res.ok) { setError("Sign-in failed"); return; }
    window.sessionStorage.removeItem("businessvault-organization");
    window.location.reload();
  }

  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", fontSize: 13 }}>
      <span style={{ fontFamily: "var(--font-mono, monospace)", color: "#2f6f4f" }}>TideCloak (sim) · signed in as</span>
      <select value={current} onChange={event => void change(event.target.value)} aria-label="Simulated TideCloak account">
        {!current && <option value="">Unknown account</option>}
        {SIM_USERS.map(user => <option key={user.username} value={user.username}>{user.name}</option>)}
      </select>
      <a href="/auth/logout" style={{ fontSize: 12 }}>Sign out</a>
      {error && <span role="alert" style={{ color: "#b42318" }}>{error}</span>}
    </label>
  );
}

function DevCookieSwitcher() {
  const [current, setCurrent] = useState("");
  useEffect(() => { setCurrent(readCookie("bv-dev-subject")); }, []);
  if (process.env.NEXT_PUBLIC_AUTH_MODE !== "development") return null;

  function change(subject: string) {
    const persona = DEMO_PERSONAS.find(item => item.subject === subject);
    setCookie("bv-dev-subject", persona?.subject ?? "");
    setCookie("bv-dev-name", persona?.name ?? "");
    setCookie("bv-dev-email", persona?.email ?? "");
    window.sessionStorage.removeItem("businessvault-organization");
    window.location.reload();
  }

  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", fontSize: 13 }}>
      <span style={{ fontFamily: "var(--font-mono, monospace)", color: "#b42318" }}>DEV · acting as</span>
      <select value={current} onChange={event => change(event.target.value)} aria-label="Development identity">
        <option value="">Default dev user</option>
        {DEMO_PERSONAS.map(persona => <option key={persona.subject} value={persona.subject}>{persona.name}</option>)}
      </select>
    </label>
  );
}
