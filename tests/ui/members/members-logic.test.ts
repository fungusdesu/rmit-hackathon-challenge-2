import { describe, expect, it } from "vitest";
import { buildMemberChangeRequest, buildPrivilegedInviteRequest, invitationNeedsRequest, invitationStatus, memberChangePath, quorumSummary, validReason } from "../../../app/dashboard/members/members-logic";

describe("members logic", () => {
  it("routes invitations like lib/invitations.ts", () => {
    expect(invitationNeedsRequest("MEMBER", "ACTIVE", "OWNER")).toBe(false);
    expect(invitationNeedsRequest("AUDITOR", "ACTIVE", "ADMIN")).toBe(false);
    expect(invitationNeedsRequest("ADMIN", "ACTIVE", "OWNER")).toBe(true);
    expect(invitationNeedsRequest("OWNER", "INITIALIZING", "OWNER")).toBe(false);
    expect(invitationNeedsRequest("ADMIN", "INITIALIZING", "OWNER")).toBe(true);
  });
  it("routes member changes like lib/membership-governance.ts", () => {
    expect(memberChangePath("MEMBER", { role: "AUDITOR" })).toBe("direct");
    expect(memberChangePath("MEMBER", { status: "SUSPENDED" })).toBe("direct");
    expect(memberChangePath("MEMBER", { role: "ADMIN" })).toBe("CHANGE_PRIVILEGED_MEMBERSHIP");
    expect(memberChangePath("ADMIN", { status: "REMOVED" })).toBe("CHANGE_PRIVILEGED_MEMBERSHIP");
    expect(memberChangePath("OWNER", { status: "REMOVED" })).toBe("REMOVE_OWNER");
    expect(memberChangePath("OWNER", { status: "SUSPENDED" })).toBe("CHANGE_PRIVILEGED_MEMBERSHIP");
  });
  it("builds payloads", () => {
    expect(buildPrivilegedInviteRequest(" A@B.co ", "ADMIN", " because ", "key12345")).toEqual({ operationType: "INVITE_PRIVILEGED_MEMBER", idempotencyKey: "key12345", payload: { email: "a@b.co", role: "ADMIN", reason: "because" } });
    expect(buildMemberChangeRequest("m1", "u1", "OWNER", { status: "REMOVED" }, "leaving co", "key12345").body).toEqual({ operationType: "REMOVE_OWNER", idempotencyKey: "key12345", payload: { targetUserId: "u1", reason: "leaving co" } });
    expect(buildMemberChangeRequest("m1", "u1", "MEMBER", { role: "AUDITOR" }, "audit duty").body).toEqual({ role: "AUDITOR", reason: "audit duty" });
    expect(buildMemberChangeRequest("m1", "u1", "ADMIN", { role: "MEMBER" }, "demotion", "key12345").body).toEqual({ operationType: "CHANGE_PRIVILEGED_MEMBERSHIP", idempotencyKey: "key12345", payload: { memberId: "m1", role: "MEMBER", reason: "demotion" } });
  });
  it("derives invitation status, quorum and reason validity", () => {
    const now = Date.parse("2026-01-02");
    expect(invitationStatus({ expiresAt: "2026-01-03", acceptedAt: null, revokedAt: null }, now)).toBe("PENDING");
    expect(invitationStatus({ expiresAt: "2026-01-01", acceptedAt: null, revokedAt: null }, now)).toBe("EXPIRED");
    expect(invitationStatus({ expiresAt: "2026-01-03", acceptedAt: "x", revokedAt: null }, now)).toBe("ACCEPTED");
    expect(invitationStatus({ expiresAt: "2026-01-03", acceptedAt: null, revokedAt: "x" }, now)).toBe("REVOKED");
    expect(quorumSummary(5, 2).healthy).toBe(true);
    expect(quorumSummary(3, 2).healthy).toBe(false);
    expect(quorumSummary(1, 2).text).toContain("1 active owner;");
    expect(validReason("abcd")).toBe(false);
    expect(validReason("abcde")).toBe(true);
  });
});
