// Simulated TideCloak realm (AUTH_MODE=tidecloak-sim). It mirrors what a real Tide realm.json declares:
// the `_tide_enabled` gate role and the vault self-encryption roles. Org roles (OWNER/ADMIN/...) stay in
// the app database, exactly as they do with a live realm. See docs/TIDECLOAK_PLAN.md.
import { TIDE_VAULT_ROLES } from "@/lib/vault/contracts";

export const SIM_REALM = "businessvault";
export const SIM_CLIENT_ID = "businessvault-web";
export const TIDE_ENABLED_ROLE = "_tide_enabled";

export type SimUser = { username: string; subject: string; name: string; email: string; realmRoles: string[]; hint: string };

const ALL_VAULT = [TIDE_ENABLED_ROLE, TIDE_VAULT_ROLES.encrypt, TIDE_VAULT_ROLES.decrypt];

// Subjects match scripts/dev/seed-demo.mjs so the demo org works in both local modes.
export const SIM_USERS: SimUser[] = [
  { username: "alice", subject: "demo-alice", name: "Alice (owner)", email: "alice@northstar.test", realmRoles: ALL_VAULT, hint: "Owner" },
  { username: "bob", subject: "demo-bob", name: "Bob (owner)", email: "bob@northstar.test", realmRoles: ALL_VAULT, hint: "Owner" },
  { username: "carol", subject: "demo-carol", name: "Carol (owner)", email: "carol@northstar.test", realmRoles: ALL_VAULT, hint: "Owner" },
  { username: "dave", subject: "demo-dave", name: "Dave (member)", email: "dave@northstar.test", realmRoles: ALL_VAULT, hint: "Member" },
  { username: "erin", subject: "demo-erin", name: "Erin (auditor)", email: "erin@northstar.test", realmRoles: [TIDE_ENABLED_ROLE, TIDE_VAULT_ROLES.decrypt], hint: "Auditor · no encrypt role" },
  { username: "mallory", subject: "demo-mallory", name: "Mallory (outsider)", email: "mallory@outside.test", realmRoles: [TIDE_ENABLED_ROLE], hint: "Outsider · no vault roles" },
  { username: "victor", subject: "demo-victor", name: "Victor (not Tide-enabled)", email: "victor@outside.test", realmRoles: [], hint: "Missing _tide_enabled · API refuses" },
];

export function findSimUser(username: unknown) {
  return typeof username === "string" ? SIM_USERS.find(user => user.username === username.trim().toLowerCase()) ?? null : null;
}
