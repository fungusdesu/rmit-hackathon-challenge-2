import { describe, expect, it } from "vitest";
import { describeOutput, errorText, toMarkdown } from "@/lib/vault/client/diagnostics";

describe("diagnostics markdown", () => {
  it("renders the verification matrix columns and escapes cells", () => {
    const md = toMarkdown([
      { actor: "alice", test: "1 MiB bytes round-trip", result: "PASS", ms: 1234.6, outputTypes: "enc Uint8Array(10) / dec string(3)", error: "" },
      { actor: "mallory", test: "encrypt only", result: "ERROR", ms: null, outputTypes: "-", error: "Error: denied | by\npolicy" },
    ]);
    const lines = md.split("\n");
    expect(lines[0]).toBe("| Actor | Test | Result | ms | Output types | Error |");
    expect(lines[2]).toBe("| alice | 1 MiB bytes round-trip | PASS | 1235 | enc Uint8Array(10) / dec string(3) | - |");
    expect(lines[3]).toBe("| mallory | encrypt only | ERROR | - | - | Error: denied \\| by policy |");
    expect(lines).toHaveLength(4);
  });
  it("describes outputs and errors without echoing values", () => {
    expect(describeOutput(new Uint8Array(4))).toBe("Uint8Array(4)");
    expect(describeOutput("secret")).toBe("string(6)");
    expect(errorText(new TypeError("x"))).toBe("TypeError: x");
    expect(errorText("secret")).toBe("Non-Error thrown: string");
  });
});
