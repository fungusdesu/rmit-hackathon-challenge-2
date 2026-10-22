import { describe, expect, it } from "vitest";
import { buildPolicyChangeRequest, eligibleApprovers, formatTtl, validatePolicyChange } from "@/app/dashboard/settings/policy-change";

const base = { operationType: "INVITE_PRIVILEGED_MEMBER", requiredApprovals: 2, ttlSeconds: 86400, baseVersion: 1, reason: "Tighten quorum" };

describe("policy change validation", () => {
  it("accepts a reachable quorum", () => {
    expect(validatePolicyChange(base, 4)).toEqual({ errors: [], warnings: [] });
  });
  it("rejects < 1 and server minimum of 2", () => {
    expect(validatePolicyChange({ ...base, requiredApprovals: 0 }, 4).errors[0]).toMatch(/at least 1/);
    const one = validatePolicyChange({ ...base, requiredApprovals: 1 }, 4);
    expect(one.errors.join()).toMatch(/at least 2/);
    expect(one.warnings.join()).toMatch(/1-of-4/);
  });
  it("rejects more approvals than owners", () => {
    expect(validatePolicyChange({ ...base, requiredApprovals: 5 }, 4).errors.join()).toMatch(/exceed the 4/);
  });
  it("warns when quorum is unreachable after exclusions", () => {
    expect(validatePolicyChange({ ...base, requiredApprovals: 3 }, 3).warnings.join()).toMatch(/unreachable/);
    expect(validatePolicyChange({ ...base, operationType: "REMOVE_OWNER", requiredApprovals: 2 }, 3).warnings.join()).toMatch(/unreachable/);
  });
  it("validates ttl, version, reason, operation and no-op", () => {
    expect(validatePolicyChange({ ...base, ttlSeconds: 60 }, 4).errors.join()).toMatch(/window/);
    expect(validatePolicyChange({ ...base, baseVersion: 0 }, 4).errors.join()).toMatch(/version/);
    expect(validatePolicyChange({ ...base, reason: " x " }, 4).errors.join()).toMatch(/Reason/);
    expect(validatePolicyChange({ ...base, operationType: "UPDATE_POLICY" }, 4).errors.join()).toMatch(/operation/);
    expect(validatePolicyChange(base, 4, { requiredApprovals: 2, ttlSeconds: 86400 }).errors.join()).toMatch(/identical/);
  });
  it("counts eligible approvers", () => {
    expect(eligibleApprovers("REMOVE_OWNER", 3)).toBe(1);
    expect(eligibleApprovers("CHANGE_PRIVILEGED_MEMBERSHIP", 3)).toBe(2);
    expect(eligibleApprovers("REMOVE_OWNER", 1)).toBe(0);
  });
});

describe("payload builder", () => {
  it("matches the server UPDATE_POLICY shape", () => {
    expect(buildPolicyChangeRequest({ ...base, reason: "  Tighten quorum  " }, "key-12345678")).toEqual({
      operationType: "UPDATE_POLICY",
      idempotencyKey: "key-12345678",
      payload: { operationType: "INVITE_PRIVILEGED_MEMBER", requiredApprovals: 2, ttlSeconds: 86400, baseVersion: 1, reason: "Tighten quorum" },
    });
  });
  it("formats ttl", () => {
    expect(formatTtl(86400)).toBe("1 day");
    expect(formatTtl(7200)).toBe("2 hours");
    expect(formatTtl(300)).toBe("5 min");
  });
});
