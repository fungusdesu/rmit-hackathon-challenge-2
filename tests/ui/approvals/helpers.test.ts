import { describe, expect, it } from "vitest";
import { buildPayload, buildTimeline, effectiveStatus, formatCountdown, newIdempotencyKey, quorumProgress, statusTone, validatePayload } from "../../../app/dashboard/approvals/helpers";

describe("buildPayload", () => {
  it("REMOVE_OWNER", () => {
    const p = buildPayload("REMOVE_OWNER", { targetUserId: " u1 ", reason: " leaving co " });
    expect(p).toEqual({ targetUserId: "u1", reason: "leaving co" });
    expect(validatePayload("REMOVE_OWNER", p)).toBeNull();
  });
  it("INVITE lowercases email and validates role", () => {
    const p = buildPayload("INVITE_PRIVILEGED_MEMBER", { email: "A@B.CO", role: "OWNER", reason: "new cfo" });
    expect(p).toEqual({ email: "a@b.co", role: "OWNER", reason: "new cfo" });
    expect(validatePayload("INVITE_PRIVILEGED_MEMBER", { ...p, role: "MEMBER" })).toBe("invalid_role");
  });
  it("CHANGE omits empty role/status", () => {
    const p = buildPayload("CHANGE_PRIVILEGED_MEMBERSHIP", { memberId: "m1", status: "SUSPENDED", reason: "audit hold" });
    expect(p).toEqual({ memberId: "m1", status: "SUSPENDED", reason: "audit hold" });
    expect(validatePayload("CHANGE_PRIVILEGED_MEMBERSHIP", { memberId: "m1", reason: "audit hold" })).toBe("invalid_request");
  });
  it("UPDATE_POLICY parses integers and validates ranges", () => {
    const p = buildPayload("UPDATE_POLICY", { policyOperation: "REMOVE_OWNER", requiredApprovals: "2", ttlSeconds: "3600", baseVersion: "1", reason: "tighten" });
    expect(p).toEqual({ operationType: "REMOVE_OWNER", requiredApprovals: 2, ttlSeconds: 3600, baseVersion: 1, reason: "tighten" });
    expect(validatePayload("UPDATE_POLICY", p)).toBeNull();
    expect(validatePayload("UPDATE_POLICY", { ...p, requiredApprovals: 1 })).toBe("invalid_quorum");
    expect(validatePayload("UPDATE_POLICY", { ...p, ttlSeconds: 10 })).toBe("invalid_ttl");
  });
  it("short reason rejected", () => {
    expect(validatePayload("REMOVE_OWNER", { targetUserId: "x", reason: "no" })).toBe("invalid_reason");
  });
});

describe("formatting", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  it("countdown", () => {
    expect(formatCountdown("2026-01-02T03:00:00Z", now)).toBe("1d 3h left");
    expect(formatCountdown("2026-01-01T02:05:00Z", now)).toBe("2h 5m left");
    expect(formatCountdown("2026-01-01T00:01:30Z", now)).toBe("1m 30s left");
    expect(formatCountdown("2025-12-31T00:00:00Z", now)).toBe("Expired");
  });
  it("quorum", () => {
    const q = quorumProgress([{ decision: "APPROVED" }, { decision: "APPROVED" }, { decision: "REJECTED" }], 2);
    expect(q).toMatchObject({ approved: 2, rejected: 1, complete: true, text: "2 of 2 approvals" });
    expect(quorumProgress([], null).text).toContain("unknown");
  });
  it("status", () => {
    expect(effectiveStatus("PENDING", "2025-01-01T00:00:00Z", now)).toBe("EXPIRED");
    expect(effectiveStatus("EXECUTED", "2025-01-01T00:00:00Z", now)).toBe("EXECUTED");
    expect(statusTone("REJECTED")).toBe("bad");
  });
  it("timeline sorted", () => {
    const t = buildTimeline({ createdAt: "2026-01-01T00:00:00Z", status: "EXECUTED", requester: { displayName: "A" }, approvals: [{ decision: "APPROVED", createdAt: "2026-01-01T01:00:00Z", approver: { displayName: "B" } }], executions: [{ status: "SUCCEEDED", attemptedAt: "2026-01-01T02:00:00Z" }] });
    expect(t.map(e => e.label)).toEqual(["Requested by A", "Approved by B", "Execution SUCCEEDED"]);
  });
  it("idempotency key", () => { expect(newIdempotencyKey().length).toBeGreaterThanOrEqual(8); });
});
