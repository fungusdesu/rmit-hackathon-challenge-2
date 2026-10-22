import { afterEach, describe, expect, it } from "vitest";
import { VaultError } from "@/lib/vault/contracts";
import { parseUploadInit } from "@/lib/vault/server/validation";

const valid = {
  classification: "CONFIDENTIAL",
  declaredContentType: "application/pdf",
  ciphertextSize: 100,
  ciphertextSha256: "a".repeat(64),
  ciphertextFormat: "tide-e2ee-v1",
  encryptionPolicyTag: "vault",
  encryptedName: "c2VjcmV0",
};

function codeOf(body: unknown) {
  try {
    parseUploadInit(body);
    return "ok";
  } catch (error) {
    return error instanceof VaultError ? error.code : "other";
  }
}

const originalMode = process.env.AUTH_MODE;
afterEach(() => {
  process.env.AUTH_MODE = originalMode;
});

describe("parseUploadInit", () => {
  it("accepts a valid body", () => {
    expect(parseUploadInit(valid)).toEqual(valid);
  });

  it.each([
    ["non-object", null, "invalid_request"],
    ["array", [], "invalid_request"],
    ["unknown key", { ...valid, extra: 1 }, "invalid_request"],
    ["classification", { ...valid, classification: "TOP" }, "invalid_request"],
    ["content type", { ...valid, declaredContentType: "application/x-msdownload" }, "unsupported_content_type"],
    ["size zero", { ...valid, ciphertextSize: 0 }, "invalid_request"],
    ["size float", { ...valid, ciphertextSize: 1.5 }, "invalid_request"],
    ["size string", { ...valid, ciphertextSize: "10" }, "invalid_request"],
    ["size too large", { ...valid, ciphertextSize: 100 * 1024 * 1024 }, "payload_too_large"],
    ["sha uppercase", { ...valid, ciphertextSha256: "A".repeat(64) }, "invalid_request"],
    ["sha short", { ...valid, ciphertextSha256: "a".repeat(63) }, "invalid_request"],
    ["format", { ...valid, ciphertextFormat: "plain" }, "invalid_request"],
    ["policy tag", { ...valid, encryptionPolicyTag: "other" }, "invalid_request"],
    ["name empty", { ...valid, encryptedName: "" }, "invalid_request"],
    ["name not base64", { ...valid, encryptedName: "report.pdf" }, "invalid_request"],
    ["name too long", { ...valid, encryptedName: "A".repeat(4097) }, "invalid_request"],
  ])("%s", (_label, body, expected) => {
    expect(codeOf(body)).toBe(expected);
  });

  it("rejects demo format outside development mode", () => {
    process.env.AUTH_MODE = "tidecloak";
    expect(codeOf({ ...valid, ciphertextFormat: "demo-not-e2ee-v1" })).toBe("invalid_request");
    delete process.env.AUTH_MODE;
    expect(codeOf({ ...valid, ciphertextFormat: "demo-not-e2ee-v1" })).toBe("invalid_request");
    process.env.AUTH_MODE = "development";
    expect(codeOf({ ...valid, ciphertextFormat: "demo-not-e2ee-v1" })).toBe("ok");
  });

  it("does not echo input in error messages", () => {
    try {
      parseUploadInit({ ...valid, classification: "SECRET_MARKER" });
    } catch (error) {
      expect((error as Error).message).not.toContain("SECRET_MARKER");
    }
  });
});
