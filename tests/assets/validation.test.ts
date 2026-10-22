import { describe, expect, it } from "vitest";
import { AssetError, isReviewOverdue, parseAssetCreate, parseAssetUpdate } from "@/lib/assets/validation";

const base = { name: "Acme GitHub", type: "GITHUB_ORG", provider: "GITHUB" };
const code = (fn: () => unknown) => { try { fn(); return null; } catch (e) { return e instanceof AssetError ? e.code : "other"; } };

describe("asset validation", () => {
  it("applies defaults", () => {
    const input = parseAssetCreate(base);
    expect(input.managedMode).toBe("INVENTORY_ONLY");
    expect(input.criticality).toBe("MEDIUM");
    expect(input.custodians).toEqual([]);
    expect(input.reviewDate).toBeNull();
  });
  it("validates name length", () => {
    expect(code(() => parseAssetCreate({ ...base, name: "a" }))).toBe("invalid_name");
    expect(code(() => parseAssetCreate({ ...base, name: "x".repeat(121) }))).toBe("invalid_name");
    expect(parseAssetCreate({ ...base, name: "  ok  " }).name).toBe("ok");
  });
  it("enforces allowlists", () => {
    expect(code(() => parseAssetCreate({ ...base, type: "SERVER" }))).toBe("invalid_type");
    expect(code(() => parseAssetCreate({ ...base, provider: "evil" }))).toBe("invalid_provider");
    expect(code(() => parseAssetCreate({ ...base, criticality: "EXTREME" }))).toBe("invalid_criticality");
  });
  it("rejects CRYPTOGRAPHICALLY_GATED with a clear error", () => {
    try { parseAssetCreate({ ...base, managedMode: "CRYPTOGRAPHICALLY_GATED" }); throw new Error("no"); }
    catch (e) { expect(e).toBeInstanceOf(AssetError); expect((e as AssetError).code).toBe("managed_mode_not_enforced"); expect((e as Error).message).toMatch(/not enforce/); }
  });
  it("rejects unknown fields and bad contacts/dates", () => {
    expect(code(() => parseAssetCreate({ ...base, organizationId: "x" }))).toBe("invalid_field");
    expect(code(() => parseAssetCreate({ ...base, custodians: "a" }))).toBe("invalid_field");
    expect(code(() => parseAssetCreate({ ...base, custodians: [1] }))).toBe("invalid_field");
    expect(code(() => parseAssetCreate({ ...base, reviewDate: "tomorrow" }))).toBe("invalid_field");
    expect(code(() => parseAssetCreate(null))).toBe("invalid_request");
  });
  it("parses partial updates", () => {
    expect(parseAssetUpdate({ criticality: "HIGH" })).toEqual({ criticality: "HIGH" });
    expect(code(() => parseAssetUpdate({}))).toBe("invalid_request");
    expect(code(() => parseAssetUpdate({ managedMode: "CRYPTOGRAPHICALLY_GATED" }))).toBe("managed_mode_not_enforced");
  });
  it("computes review overdue", () => {
    const now = new Date("2026-10-22T00:00:00Z");
    expect(isReviewOverdue("2026-10-01", now)).toBe(true);
    expect(isReviewOverdue("2026-12-01", now)).toBe(false);
    expect(isReviewOverdue(null, now)).toBe(false);
  });
});
