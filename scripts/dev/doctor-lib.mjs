// Pure helpers for doctor.mjs (no deps, cross-platform).
export const REQUIRED_ENV = ["DATABASE_URL", "S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_REGION"];
export const PORTS = [3000, 5432, 9000, 8080];

export function parseNodeMajor(version) {
  const m = /^v?(\d+)/.exec(String(version));
  return m ? Number(m[1]) : NaN;
}

/** Parse dotenv text into a map. Values are kept only to test presence; never print them. */
export function parseEnvFile(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

export function missingEnv(required, ...sources) {
  return required.filter((k) => !sources.some((s) => s && typeof s[k] === "string" && s[k].length > 0));
}

/** Extract host/port from a URL like postgresql://u:p@host:5432/db or http://host:9000. */
export function parseHostPort(url, defaultPort) {
  try {
    const u = new URL(url);
    return { host: u.hostname || "localhost", port: Number(u.port) || defaultPort };
  } catch {
    return null;
  }
}

export function formatTable(rows) {
  const headers = ["STATUS", "CHECK", "DETAIL"];
  const data = rows.map((r) => [r.status, r.name, r.detail ?? ""]);
  const widths = headers.map((h, i) => Math.max(h.length, ...data.map((d) => d[i].length)));
  const fmt = (cols) => cols.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  return [fmt(headers), widths.map((w) => "-".repeat(w)).join("  "), ...data.map(fmt)].join("\n");
}

export function summarize(rows) {
  const count = (s) => rows.filter((r) => r.status === s).length;
  return { pass: count("PASS"), warn: count("WARN"), fail: count("FAIL") };
}
