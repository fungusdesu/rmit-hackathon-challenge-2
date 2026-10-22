import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { parseNodeMajor, parseEnvFile, missingEnv, parseHostPort, formatTable, summarize } from "../../scripts/dev/doctor-lib.mjs";

describe("doctor helpers", () => {
  it("parses node major", () => {
    expect(parseNodeMajor("v22.3.1")).toBe(22);
    expect(Number.isNaN(parseNodeMajor("x"))).toBe(true);
  });
  it("parses env files incl. CRLF, quotes, comments, export", () => {
    const env = parseEnvFile("# c\r\nA=1\r\nexport B=\"two\"\nC='3'\nbad line\nD=");
    expect(env).toEqual({ A: "1", B: "two", C: "3", D: "" });
  });
  it("reports missing env names only", () => {
    expect(missingEnv(["A", "B", "C"], { A: "x" }, { B: "y", C: "" })).toEqual(["C"]);
  });
  it("parses host/port", () => {
    expect(parseHostPort("postgresql://u:p@postgres:5432/db", 1)).toEqual({ host: "postgres", port: 5432 });
    expect(parseHostPort("http://localhost", 9000)).toEqual({ host: "localhost", port: 9000 });
    expect(parseHostPort("nope", 1)).toBeNull();
  });
  it("formats a table and summarizes", () => {
    const rows = [{ status: "PASS", name: "Node", detail: "v22" }, { status: "FAIL", name: "Docker" }];
    const t = formatTable(rows).split("\n");
    expect(t[0]).toMatch(/^STATUS\s+CHECK\s+DETAIL$/);
    expect(t[2]).toBe("PASS    Node    v22");
    expect(t[3]).toBe("FAIL    Docker");
    expect(summarize(rows)).toEqual({ pass: 1, warn: 0, fail: 1 });
  });
});
