import { describe, expect, it } from "vitest";
import { FOUNDING_OWNERS, governanceErrorText, governanceLocked, governanceLockText } from "../../app/dashboard/governance-lock";

describe("governance lock", () => {
  it("locks governed requests like lib/approvals.ts", () => {
    expect(governanceLocked("ACTIVE")).toBe(false);
    expect(governanceLocked("INITIALIZING")).toBe(true);
    expect(governanceLocked("")).toBe(true);
    expect(governanceLocked(undefined)).toBe(true);
  });
  it("explains founding-owner progress", () => {
    expect(FOUNDING_OWNERS).toBe(3);
    expect(governanceLockText(1)).toContain("1 of 3 founding owners have joined");
    expect(governanceLockText(7)).toContain("3 of 3");
    expect(governanceLockText(-1)).toContain("0 of 3");
  });
  it("maps only the governance_not_active code", () => {
    expect(governanceErrorText("governance_not_active")).toContain("Governance isn't active yet");
    expect(governanceErrorText("quorum_unavailable")).toBeNull();
  });
});
