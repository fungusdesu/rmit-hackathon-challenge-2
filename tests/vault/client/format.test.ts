import { describe, expect, it } from "vitest";
import { VAULT_ERRORS } from "@/lib/vault/contracts";
import { formatBytes, sanitizeDownloadName } from "@/lib/vault/client/format";
import { VaultApiError } from "@/lib/vault/client/api";
import { VaultFlowError } from "@/lib/vault/client/vault-flow";
import { ERROR_MESSAGES, errorMessage } from "@/app/dashboard/vault/errors";

describe("sanitizeDownloadName", () => {
  it("keeps ordinary names", () => {
    expect(sanitizeDownloadName("Q3 report.pdf")).toBe("Q3 report.pdf");
    expect(sanitizeDownloadName("résumé.docx")).toBe("résumé.docx");
  });
  it("strips path separators and traversal", () => {
    expect(sanitizeDownloadName("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(sanitizeDownloadName("..\\..\\Windows\\win.ini")).toBe("_.._Windows_win.ini");
    expect(sanitizeDownloadName("/abs/path.txt")).toBe("_abs_path.txt");
    expect(sanitizeDownloadName("C:evil.txt")).toBe("C_evil.txt");
    for (const n of ["a/b", "a\\b", "../x", "..\\x"]) expect(sanitizeDownloadName(n)).not.toMatch(/[/\\]/);
  });
  it("strips control and bidi characters", () => {
    expect(sanitizeDownloadName("a\u0000b\nc\r\td.txt")).toBe("a_b_c__d.txt");
    expect(sanitizeDownloadName("invoice\u202Efdp.exe")).toBe("invoice_fdp.exe");
    expect(sanitizeDownloadName("x\u007F\u009Fy")).toBe("x__y");
  });
  it("handles HTML-looking names as plain characters", () => {
    expect(sanitizeDownloadName("<img src=x onerror=alert(1)>.png")).toBe("_img src=x onerror=alert(1)_.png");
  });
  it("falls back for empty, dot-only and reserved names", () => {
    expect(sanitizeDownloadName("")).toBe("document");
    expect(sanitizeDownloadName("...")).toBe("document");
    expect(sanitizeDownloadName("   ")).toBe("document");
    expect(sanitizeDownloadName(".hidden")).toBe("hidden");
    expect(sanitizeDownloadName("CON.txt")).toBe("_CON.txt");
  });
  it("caps length and keeps the extension", () => {
    const out = sanitizeDownloadName(`${"a".repeat(500)}.pdf`);
    expect(out.length).toBe(200);
    expect(out.endsWith(".pdf")).toBe(true);
  });
});

describe("formatBytes", () => {
  it("formats human-readable sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.5 KiB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MiB");
    expect(formatBytes(-1)).toBe("-");
  });
});

describe("error messages", () => {
  it("has a message for every VaultErrorCode and client code", () => {
    for (const code of [...Object.keys(VAULT_ERRORS), "network_error", "upload_failed"]) {
      expect(ERROR_MESSAGES[code as keyof typeof ERROR_MESSAGES]).toBeTruthy();
      expect(errorMessage(new VaultApiError(code as never, 0))).toBe(ERROR_MESSAGES[code as keyof typeof ERROR_MESSAGES]);
    }
    expect(errorMessage(new VaultFlowError("decrypt_failed"))).toMatch(/uploader/);
    expect(errorMessage(new TypeError("Failed to fetch"))).toBe(ERROR_MESSAGES.network_error);
    expect(errorMessage("weird")).toMatch(/Unexpected/);
  });
});
