/**
 * Audit hash-chain verification and export helpers.
 *
 * LIMITS: verification only detects edits relative to the database itself. A database
 * superuser can rewrite every row and recompute the whole chain; there is no external
 * anchor (externalAnchorRef is unused) yet, so a passing result is not proof of integrity.
 */
import { createHash } from "node:crypto";
import { MembershipRole, type AuditEvent } from "@prisma/client";
import { db } from "./db";
import { GovernanceError } from "./governance-error";
import { getMembership } from "./organizations";
import type { Principal } from "./auth/types";

// Must mirror lib/audit.ts exactly (canonicalize + hashEvent, hashVersion 2).
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalize(entry)]));
  return value;
}

type HashInput = { organizationId: string; actorId: string | null; action: string; target: string; eventJson: unknown; occurredAt: Date; previousEventHash: string | null };

export function computeEventHashV2(input: HashInput) {
  return createHash("sha256").update(JSON.stringify(canonicalize({ organizationId: input.organizationId, actorId: input.actorId, action: input.action, target: input.target, eventJson: input.eventJson, occurredAt: input.occurredAt.toISOString(), previous: input.previousEventHash }))).digest("hex");
}

/** Legacy (hashVersion 1) format used by scripts/vault/sweep-pending.ts: same fields, NOT canonicalized. After a JSONB round-trip key order may differ, so a mismatch counts as unverifiable, not broken. */
export function computeEventHashV1(input: HashInput) {
  return createHash("sha256").update(JSON.stringify({ organizationId: input.organizationId, actorId: input.actorId, action: input.action, target: input.target, eventJson: input.eventJson, occurredAt: input.occurredAt.toISOString(), previous: input.previousEventHash })).digest("hex");
}

export type ChainEvent = Pick<AuditEvent, "id" | "organizationId" | "actorId" | "action" | "target" | "eventJson" | "occurredAt" | "previousEventHash" | "eventHash" | "hashVersion">;
export type Fork = { previousEventHash: string | null; eventIds: string[] };
export type VerifyResult = { ok: boolean; checked: number; total: number; legacyUnverifiable: number; forks: Fork[]; firstBrokenEventId?: string; reason?: string; integrity: string };

export const INTEGRITY_NOTE = "Database hash chain only. Detects edits relative to the database itself; a database superuser can rewrite the whole chain. Not externally anchored.";

/** Pure chain check over events sorted by occurredAt asc, id asc. */
export function verifyEvents(events: ChainEvent[]): VerifyResult {
  const byPrevious = new Map<string, string[]>();
  for (const e of events) {
    const key = e.previousEventHash ?? "<genesis>";
    byPrevious.set(key, [...(byPrevious.get(key) ?? []), e.id]);
  }
  const forks: Fork[] = [...byPrevious.entries()].filter(([, ids]) => ids.length > 1).map(([k, ids]) => ({ previousEventHash: k === "<genesis>" ? null : k, eventIds: ids }));
  let previous: string | null = null;
  let legacyUnverifiable = 0;
  let checked = 0;
  const base = { total: events.length, forks, integrity: INTEGRITY_NOTE };
  for (const e of events) {
    if (e.previousEventHash !== previous) return { ok: false, checked, legacyUnverifiable, ...base, firstBrokenEventId: e.id, reason: forks.length ? "Chain link mismatch (fork: several events share one previous hash)" : "previousEventHash does not match the preceding event's hash" };
    if (e.hashVersion === 2) {
      if (computeEventHashV2(e) !== e.eventHash) return { ok: false, checked, legacyUnverifiable, ...base, firstBrokenEventId: e.id, reason: "Recomputed eventHash does not match the stored value (row content changed)" };
    } else if (computeEventHashV1(e) !== e.eventHash) legacyUnverifiable++;
    checked++;
    previous = e.eventHash;
  }
  return { ok: forks.length === 0, checked, legacyUnverifiable, ...base, ...(forks.length ? { reason: "Fork detected" } : {}) };
}

export async function verifyAuditChain(organizationId: string): Promise<VerifyResult> {
  const events = await db.auditEvent.findMany({ where: { organizationId }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] });
  return verifyEvents(events);
}

const AUDIT_ROLES: MembershipRole[] = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.AUDITOR];

/** 404 for non-members, 403 for members without OWNER/ADMIN/AUDITOR. */
export async function requireAuditAccess(organizationId: string, principal: Principal) {
  const membership = await getMembership(organizationId, principal);
  if (!membership) throw new GovernanceError("not_found", 404);
  if (!AUDIT_ROLES.includes(membership.role)) throw new GovernanceError("forbidden", 403);
  return membership;
}

export async function verifyAuditForPrincipal(organizationId: string, principal: Principal) {
  await requireAuditAccess(organizationId, principal);
  return verifyAuditChain(organizationId);
}

export async function exportAuditForPrincipal(organizationId: string, principal: Principal) {
  await requireAuditAccess(organizationId, principal);
  const events = await db.auditEvent.findMany({ where: { organizationId }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }], include: { actor: { select: { displayName: true } } } });
  return events.map(({ actor, ...e }) => ({ ...e, actorName: actor?.displayName ?? null }));
}

export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_COLUMNS = ["id", "occurredAt", "actorId", "actorName", "action", "target", "correlationId", "previousEventHash", "eventHash", "hashVersion", "eventJson"] as const;

export function toCsv(rows: Array<Record<string, unknown>>) {
  return [CSV_COLUMNS.join(","), ...rows.map(r => CSV_COLUMNS.map(c => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
}
