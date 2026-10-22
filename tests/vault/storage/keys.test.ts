import { describe, expect, it } from "vitest";
import { generateObjectKey, isValidObjectKey } from "@/lib/storage/keys";

describe("object keys", () => {
  it("has the v1 format and length", () => {
    const key = generateObjectKey();
    expect(key.startsWith("v1/")).toBe(true);
    expect(key).toHaveLength(46);
    expect(key.slice(3)).toHaveLength(43);
    expect(isValidObjectKey(key)).toBe(true);
  });

  it("is unique across 10k keys with no extra path segments", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const key = generateObjectKey();
      expect(key.slice(3)).not.toContain("/");
      expect(isValidObjectKey(key)).toBe(true);
      keys.add(key);
    }
    expect(keys.size).toBe(10_000);
  });

  it("rejects malformed keys", () => {
    const short = "a".repeat(42);
    for (const bad of ["", `v2/${short}a`, `v1/${short}ab`, `v1/${short}`, `v1/org/${short}a`, `v1/${short}/`, `v1/${short}=`, 42]) {
      expect(isValidObjectKey(bad)).toBe(false);
    }
  });
});
