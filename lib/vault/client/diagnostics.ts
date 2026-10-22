// Diagnostics result rows and Markdown export, matching docs/vault/TIDE_E2EE_VERIFICATION.md.
export type DiagResult = "PASS" | "FAIL" | "ERROR";

export type DiagRow = {
  actor: string;
  test: string;
  result: DiagResult;
  ms: number | null;
  outputTypes: string;
  error: string; // "Name: message", or "" on success
};

export function describeOutput(v: unknown): string {
  if (v instanceof Uint8Array) return `Uint8Array(${v.length})`;
  if (typeof v === "string") return `string(${v.length})`;
  return typeof v;
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return `Non-Error thrown: ${typeof e}`;
}

const cell = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|").trim() || "-";

export function toMarkdown(rows: DiagRow[]): string {
  const head = "| Actor | Test | Result | ms | Output types | Error |\n|---|---|---|---|---|---|";
  const body = rows.map((r) => `| ${cell(r.actor)} | ${cell(r.test)} | ${r.result} | ${r.ms === null ? "-" : Math.round(r.ms)} | ${cell(r.outputTypes)} | ${cell(r.error)} |`);
  return [head, ...body].join("\n");
}
