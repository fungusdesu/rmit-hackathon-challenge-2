import "../vault/api/db-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MembershipRole } from "@prisma/client";
import type { Principal } from "@/lib/auth/types";

const who = (): Principal => {
  const subject = `asset-it-${randomUUID()}`;
  return { subject, displayName: subject.slice(0, 20), email: null, emailVerified: false, source: "development", roles: ["_tide_enabled", "_tide_vault.selfencrypt", "_tide_vault.selfdecrypt"] };
};

describe.skipIf(process.env.VAULT_IT !== "1")("asset service (real Postgres)", async () => {
  const { db } = await import("@/lib/db");
  const svc = await import("@/lib/assets/service");
  const { AssetError } = await import("@/lib/assets/validation");
  const owner = who(), admin = who(), member = who(), auditor = who(), outsider = who(), otherOwner = who();
  const orgIds: string[] = [];
  const userIds: string[] = [];
  let orgA = "", orgB = "";

  const codeOf = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e instanceof AssetError ? e.code : String(e); } };

  beforeAll(async () => {
    orgA = (await db.organization.create({ data: { name: `asset-a-${randomUUID()}` } })).id;
    orgB = (await db.organization.create({ data: { name: `asset-b-${randomUUID()}` } })).id;
    orgIds.push(orgA, orgB);
    const roles: [Principal, string | null, MembershipRole | null][] = [
      [owner, orgA, MembershipRole.OWNER], [admin, orgA, MembershipRole.ADMIN], [member, orgA, MembershipRole.MEMBER],
      [auditor, orgA, MembershipRole.AUDITOR], [outsider, null, null], [otherOwner, orgB, MembershipRole.OWNER],
    ];
    for (const [p, org, role] of roles) {
      const u = await db.user.create({ data: { tideSubject: p.subject, displayName: p.displayName } });
      userIds.push(u.id);
      if (org && role) await db.membership.create({ data: { organizationId: org, userId: u.id, role } });
    }
  });

  afterAll(async () => {
    await db.organization.deleteMany({ where: { id: { in: orgIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  const body = { name: "Prod AWS", type: "CLOUD_ACCOUNT", provider: "AWS" };

  it("non-member gets not_found", async () => {
    expect(await codeOf(svc.listAssets(orgA, outsider))).toBe("not_found");
    expect(await codeOf(svc.createAsset(orgA, outsider, body))).toBe("not_found");
  });

  it("MEMBER and AUDITOR can read but not write", async () => {
    expect(await svc.listAssets(orgA, member)).toBeInstanceOf(Array);
    expect(await codeOf(svc.createAsset(orgA, member, body))).toBe("forbidden");
    expect(await codeOf(svc.createAsset(orgA, auditor, body))).toBe("forbidden");
  });

  it("OWNER create/update/delete with audit rows; ADMIN cannot delete", async () => {
    const created = await svc.createAsset(orgA, owner, { ...body, reviewDate: "2020-01-01" });
    expect(created.reviewOverdue).toBe(true);
    const updated = await svc.updateAsset(orgA, created.id, admin, { notes: "rotated", custodians: ["ops@acme"] });
    expect(updated.custodians).toEqual(["ops@acme"]);
    expect(await codeOf(svc.deleteAsset(orgA, created.id, admin))).toBe("forbidden");
    expect(await codeOf(svc.updateAsset(orgA, created.id, auditor, { notes: "x" }))).toBe("forbidden");
    await svc.deleteAsset(orgA, created.id, owner);
    expect(await codeOf(svc.getAsset(orgA, created.id, owner))).toBe("not_found");
    const audits = await db.auditEvent.findMany({ where: { organizationId: orgA, target: created.id }, orderBy: { occurredAt: "asc" } });
    expect(audits.map(a => a.action)).toEqual(["ASSET_CREATED", "ASSET_UPDATED", "ASSET_DELETED"]);
    expect((audits[1].eventJson as { changedFields: string[] }).changedFields).toEqual(["custodians", "notes"]);
    expect(JSON.stringify(audits[1].eventJson)).not.toContain("rotated");
  });

  it("critical asset delete returns quorum conflict", async () => {
    const critical = await svc.createAsset(orgA, owner, { ...body, criticality: "CRITICAL" });
    const err = await svc.deleteAsset(orgA, critical.id, owner).catch(e => e);
    expect(err).toBeInstanceOf(AssetError);
    expect(err.code).toBe("critical_asset_requires_quorum");
    expect(err.status).toBe(409);
  });

  it("cross-tenant access is not_found", async () => {
    const a = await svc.createAsset(orgA, owner, body);
    expect(await codeOf(svc.getAsset(orgB, a.id, otherOwner))).toBe("not_found");
    expect(await codeOf(svc.updateAsset(orgB, a.id, otherOwner, { notes: "x" }))).toBe("not_found");
    expect(await codeOf(svc.deleteAsset(orgB, a.id, otherOwner))).toBe("not_found");
    expect(await codeOf(svc.getAsset(orgA, a.id, otherOwner))).toBe("not_found");
  });
});
