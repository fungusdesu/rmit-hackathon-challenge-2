import { describe, expect, it, vi } from "vitest";

// The real auth module pulls in the TideCloak SDK, which does not load under vitest.
vi.mock("@/lib/auth/errors", () => ({ authErrorResponse: () => null }));
import { VaultError } from "@/lib/vault/contracts";
import { json, vaultErrorResponse } from "@/lib/vault/server/http";

function expectDefensiveHeaders(response: Response) {
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("cache-control")).toBe("no-store");
}

describe("vault response headers", () => {
  it("success responses carry defensive headers", () => {
    expectDefensiveHeaders(json({ ok: true }));
    expectDefensiveHeaders(json({ ok: true }, 201));
  });

  it("error responses carry defensive headers", () => {
    expectDefensiveHeaders(vaultErrorResponse(new VaultError("not_found")));
    expectDefensiveHeaders(vaultErrorResponse(new Error("boom")));
  });
});
