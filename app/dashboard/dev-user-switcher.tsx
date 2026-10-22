"use client";

import { useEffect, useState } from "react";

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
