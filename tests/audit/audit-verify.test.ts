import "../vault/api/db-env";
import { randomUUID } from "node:crypto";
import { describe, expect, it, afterAll, vi } from "vitest";

// lib/auth/errors pulls in the TideCloak SDK (ESM resolution fails under Vitest); not needed here.
vi.mock("@/lib/auth/errors", () => ({ authErrorResponse: () => null }));
import { MembershipRole } from "@prisma/client";
import { computeEventHashV2, csvCell, toCsv, verifyEvents, type ChainEvent } from "@/lib/audit-verify";

function chain(n: number): ChainEvent[] {
  const out: ChainEvent[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    const e = { id: `e${i}`, organizationId: "org", actorId: i % 2 ? "u1" : null, action: "test.action", target: `t${i}`, eventJson: { b: i, a: { z: 1, y: [2, { d: 1, c: 2 }] } }, occurredAt: new Date(1_700_000_000_000 + i), previousEventHash: prev, hashVersion: 2 };
    const eventHash = computeEventHashV2(e);
    out.push({ ...e, eventHash });
    prev = eventHash;
  }
  return out;
}

describe("csv escaping", () => {
  it("neutralises formula prefixes", () => {
    for (const p of ["=", "+", "-", "@"]) expect(csvCell(`${p}SUM(A1)`)).toBe(`'${p}SUM(A1)`);
    expect(csvCell("=1,2")).toBe(`"'=1,2"`);
  });
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(null)).toBe("");
    expect(csvCell({ x: 1 })).toBe('"{""x"":1}"');
  });
  it("builds rows", () => {
    const csv = toCsv([{ id: "1", action: "=cmd" }]);
    expect(csv.split("\r\n")[1]).toContain("'=cmd");
  });
});

describe("chain recomputation", () => {
  it("accepts a valid chain regardless of JSON key order", () => {
    const events = chain(5).map(e => ({ ...e, eventJson: Object.fromEntries(Object.entries(e.eventJson as object).reverse()) }));
    const r = verifyEvents(events);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(5);
  });
  it("detects content tampering", () => {
    const events = chain(4);
    events[2] = { ...events[2], target: "evil" };
    const r = verifyEvents(events);
    expect(r.ok).toBe(false);
    expect(r.firstBrokenEventId).toBe("e2");
  });
  it("detects broken linkage", () => {
    const events = chain(4);
    events.splice(1, 1);
    expect(verifyEvents(events).firstBrokenEventId).toBe("e2");
  });
  it("reports forks", () => {
    const events = chain(3);
    const twin = { ...events[2], id: "e2b", target: "twin" };
    const r = verifyEvents([...events, { ...twin, eventHash: computeEventHashV2(twin) }]);
    expect(r.ok).toBe(false);
    expect(r.forks).toHaveLength(1);
    expect(r.forks[0].eventIds).toEqual(["e2", "e2b"]);
  });
});

describe.skipIf(process.env.VAULT_IT !== "1")("db integration", async () => {
  const { db } = await import("@/lib/db");
  const { appendAudit } = await import("@/lib/audit");
  const { verifyAuditChain, verifyAuditForPrincipal, exportAuditForPrincipal } = await import("@/lib/audit-verify");
  const suffix = randomUUID().slice(0, 8);
  const p = (name: string) => ({ subject: `audit-${suffix}-${name}`, displayName: name, email: null, emailVerified: false, source: "development" as const, roles: ["_tide_enabled", "_tide_vault.selfencrypt", "_tide_vault.selfdecrypt"] });
  let orgId = "";
  afterAll(async () => { if (orgId) await db.organization.delete({ where: { id: orgId } }).catch(() => undefined); });

  it("verifies, detects tampering, enforces roles", async () => {
    const org = await db.organization.create({ data: { name: `Audit ${suffix}` } });
    orgId = org.id;
    const roles: Record<string, MembershipRole> = { owner: "OWNER", auditor: "AUDITOR", member: "MEMBER" };
    for (const [name, role] of Object.entries(roles)) {
      const user = await db.user.create({ data: { tideSubject: p(name).subject, displayName: name } });
      await db.membership.create({ data: { organizationId: org.id, userId: user.id, role, status: "ACTIVE" } });
    }
    for (let i = 0; i < 4; i++) await db.$transaction(tx => appendAudit(tx, org.id, null, "test.event", `t${i}`, { i, nested: { b: 1, a: 2 } }));
    const ok = await verifyAuditChain(org.id);
    expect(ok).toMatchObject({ ok: true, checked: 4, forks: [] });

    expect((await verifyAuditForPrincipal(org.id, p("auditor"))).ok).toBe(true);
    expect((await exportAuditForPrincipal(org.id, p("owner"))).length).toBe(4);
    await expect(verifyAuditForPrincipal(org.id, p("member"))).rejects.toMatchObject({ status: 403 });
    await expect(exportAuditForPrincipal(org.id, p("outsider"))).rejects.toMatchObject({ status: 404 });

    const victim = (await db.auditEvent.findMany({ where: { organizationId: org.id }, orderBy: { occurredAt: "asc" } }))[2];
    await db.auditEvent.update({ where: { id: victim.id }, data: { target: "tampered" } });
    const bad = await verifyAuditChain(org.id);
    expect(bad.ok).toBe(false);
    expect(bad.firstBrokenEventId).toBe(victim.id);
  });
});
