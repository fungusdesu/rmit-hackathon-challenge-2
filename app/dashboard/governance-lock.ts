/** Owners that must accept before an organization leaves INITIALIZING (lib/invitations.ts). */
export const FOUNDING_OWNERS = 3;

/** Mirrors lib/approvals.ts: every governed request is rejected with governance_not_active until setupStatus is ACTIVE. */
export function governanceLocked(setupStatus: string | null | undefined) {
  return setupStatus !== "ACTIVE";
}

export function governanceLockText(activeOwners: number) {
  const joined = Math.min(Math.max(activeOwners, 0), FOUNDING_OWNERS);
  return `Governance isn't active yet: ${joined} of ${FOUNDING_OWNERS} founding owners have joined. Owner/Admin changes, privileged invitations and policy proposals unlock once ${FOUNDING_OWNERS} owners accept their invitations.`;
}

/** Fallback for a server rejection the UI did not predict (e.g. a stale organization list). */
export function governanceErrorText(code: string) {
  return code === "governance_not_active"
    ? `Governance isn't active yet. Owner/Admin changes, privileged invitations and policy proposals unlock once ${FOUNDING_OWNERS} founding owners accept their invitations.`
    : null;
}
