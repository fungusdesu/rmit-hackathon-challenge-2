import "./db-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MembershipRole } from "@prisma/client";
import type { Principal } from "@/lib/auth/types";

const current: { principal: Principal | null } = { principal: null };

vi.mock("@/lib/auth/server", () => {
  class AuthenticationError extends Error {}
  class AuthConfigurationError extends Error {}
  return {
    AuthenticationError,
    AuthConfigurationError,
    requirePrincipal: async () => {
      if (!current.principal) throw new AuthenticationError("no principal");
      return current.principal;
    },
  };
});

const { db } = await import("@/lib/db");
const uploadInit = await import("@/app/api/organizations/[organizationId]/documents/upload-init/route");
const list = await import("@/app/api/organizations/[organizationId]/documents/route");
const commit = await import("@/app/api/organizations/[organizationId]/documents/[documentId]/commit/route");
const download = await import("@/app/api/organizations/[organizationId]/documents/[documentId]/download/route");
const getDoc = await import("@/app/api/organizations/[organizationId]/documents/[documentId]/route");

const who = (): Principal => {
  const subject = `vault-route-${randomUUID()}`;
  return { subject, displayName: subject.slice(0, 20), email: null, emailVerified: false, source: "development" };
};

function req(body?: string) {
  return new NextRequest("http://localhost/api/x", { method: body === undefined ? "GET" : "POST", body, headers: { "content-type": "application/json" } });
}

describe.skipIf(process.env.VAULT_IT !== "1")("vault routes: membership before body", () => {
  const member = who();
  const outsider = who();
  let orgId = "";
  const userIds: string[] = [];

  beforeAll(async () => {
    const org = await db.organization.create({ data: { name: `vault-route-${randomUUID()}` } });
    orgId = org.id;
    for (const p of [member, outsider]) {
      const u = await db.user.create({ data: { tideSubject: p.subject, displayName: p.displayName } });
      userIds.push(u.id);
      if (p === member) await db.membership.create({ data: { organizationId: orgId, userId: u.id, role: MembershipRole.MEMBER } });
    }
  });

  afterAll(async () => {
    await db.organization.deleteMany({ where: { id: orgId } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  const orgParams = () => ({ params: Promise.resolve({ organizationId: orgId }) });
  const docParams = (documentId: string) => ({ params: Promise.resolve({ organizationId: orgId, documentId }) });

  it("non-member with malformed or oversized body gets 404 from upload-init", async () => {
    current.principal = outsider;
    for (const body of ["not json", "{}", JSON.stringify({ classification: "nope" }), "x".repeat(20000)]) {
      const res = await uploadInit.POST(req(body), orgParams());
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_found" });
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    }
  });

  it("member with malformed body still gets 400", async () => {
    current.principal = member;
    const res = await uploadInit.POST(req("not json"), orgParams());
    expect(res.status).toBe(400);
  });

  it("non-member gets 404 from every route", async () => {
    current.principal = outsider;
    expect((await list.GET(req(), orgParams())).status).toBe(404);
    expect((await getDoc.GET(req(), docParams("abc"))).status).toBe(404);
    expect((await commit.POST(req("garbage"), docParams("abc"))).status).toBe(404);
    expect((await download.POST(req("garbage"), docParams("abc"))).status).toBe(404);
  });

  it("malformed ids are 404 with defensive headers", async () => {
    current.principal = member;
    const res = await getDoc.GET(req(), docParams("../etc"));
    expect(res.status).toBe(404);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  function rawPost(headers: Record<string, string>, body = "{}") {
    return new NextRequest("http://localhost/api/x", { method: "POST", body, headers });
  }

  it("F-07: POST without application/json is 415 on every POST route", async () => {
    current.principal = member;
    for (const ct of [undefined, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
      const headers: Record<string, string> = ct ? { "content-type": ct } : {};
      for (const res of [
        await uploadInit.POST(rawPost(headers), orgParams()),
        await commit.POST(rawPost(headers), docParams("abc")),
        await download.POST(rawPost(headers), docParams("abc")),
      ]) {
        expect(res.status).toBe(415);
        expect(await res.json()).toEqual({ error: "unsupported_content_type" });
      }
    }
    expect((await commit.POST(rawPost({ "content-type": "application/json; charset=utf-8" }), docParams("abc"))).status).toBe(404);
  });

  it("F-07: cross-origin POST is 403; same-origin is allowed", async () => {
    current.principal = member;
    for (const origin of ["http://evil.example", "null", "http://localhost:4000", "https://localhost"]) {
      const headers = { "content-type": "application/json", origin };
      for (const res of [
        await uploadInit.POST(rawPost(headers), orgParams()),
        await commit.POST(rawPost(headers), docParams("abc")),
        await download.POST(rawPost(headers), docParams("abc")),
      ]) {
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "forbidden" });
      }
    }
    const same = await commit.POST(rawPost({ "content-type": "application/json", origin: "http://localhost" }), docParams("abc"));
    expect(same.status).toBe(404);
  });

  it("unauthenticated is 401", async () => {
    current.principal = null;
    expect((await uploadInit.POST(req("{}"), orgParams())).status).toBe(401);
  });
});
