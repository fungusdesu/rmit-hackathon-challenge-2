// Canary leak scan: node --experimental-strip-types scripts/vault/leak-scan.ts <canary> [--log-file path]
// Searches pg_dump, every MinIO object, and app logs for the canary in several encodings.
// Prints only source + encoding form, never matched content. Exit 0 PASS, 1 hit, 2 scan error.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

type Row = { source: string; result: "PASS" | "FAIL" | "ERROR" | "SKIP"; detail: string };

const args = process.argv.slice(2);
const canary = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--log-file");
const logIdx = args.indexOf("--log-file");
const logFile = logIdx >= 0 ? args[logIdx + 1] : undefined;
if (!canary || canary.length < 12) {
  console.error("usage: leak-scan.ts <canary (>=12 chars)> [--log-file path]");
  process.exit(2);
}

const raw = Buffer.from(canary, "utf8");
const needles: Array<[string, Buffer]> = [
  ["utf8", raw], ["utf16le", Buffer.from(canary, "utf16le")], ["base64", Buffer.from(raw.toString("base64"))],
  ["base64url", Buffer.from(raw.toString("base64url"))], ["hex", Buffer.from(raw.toString("hex"))],
  ["hex-upper", Buffer.from(raw.toString("hex").toUpperCase())],
];
// base64 of a substring at other alignments (canary embedded mid-stream): drop edge chars that depend on neighbours.
for (const off of [1, 2]) {
  const b = Buffer.concat([Buffer.alloc(off), raw]).toString("base64").slice(4, -4);
  if (b.length >= 12) needles.push([`base64+${off}`, Buffer.from(b)]);
}

const hits = (hay: Buffer) => needles.filter(([, n]) => hay.includes(n)).map(([f]) => f);
const rows: Row[] = [];
const record = (source: string, hay: Buffer) => {
  const h = hits(hay);
  rows.push({ source, result: h.length ? "FAIL" : "PASS", detail: h.length ? `matched: ${h.join(",")}` : `${hay.length} bytes scanned` });
};
const run = (cmd: string, a: string[]) => execFileSync(cmd, a, { maxBuffer: 1024 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });

// (a) Postgres dump
try {
  record("postgres pg_dump", run("docker", ["compose", "exec", "-T", "postgres", "pg_dump", "-U", "businessvault", "businessvault"]));
} catch (e) {
  rows.push({ source: "postgres pg_dump", result: "ERROR", detail: (e as Error).message.split("\n")[0] });
}

// (b) every object in the bucket
const bucket = process.env.S3_BUCKET ?? "businessvault";
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000", region: process.env.S3_REGION ?? "us-east-1", forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "businessvault", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "businessvault-secret" },
});
try {
  let token: string | undefined, count = 0, bytes = 0;
  const failed: string[] = [];
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    for (const o of page.Contents ?? []) {
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: o.Key }));
      const buf = Buffer.from(await obj.Body!.transformToByteArray());
      count++; bytes += buf.length;
      const h = hits(buf);
      if (h.length) failed.push(`object #${count}: ${h.join(",")}`); // never print the key itself
    }
    token = page.NextContinuationToken;
  } while (token);
  rows.push({ source: `minio bucket ${bucket}`, result: failed.length ? "FAIL" : "PASS", detail: failed.length ? `matched in ${failed.join("; ")}` : `${count} objects, ${bytes} bytes scanned` });
} catch (e) {
  const err = e as Error & { name?: string };
  rows.push({ source: `minio bucket ${bucket}`, result: err.name === "NoSuchBucket" ? "SKIP" : "ERROR", detail: err.name ?? "error" });
} finally {
  s3.destroy();
}

// (c) app logs
try {
  const running = run("docker", ["compose", "ps", "--status", "running", "--services"]).toString().split(/\r?\n/).includes("app");
  if (running) record("docker compose logs app", run("docker", ["compose", "logs", "app", "--no-color"]));
  else rows.push({ source: "docker compose logs app", result: "SKIP", detail: "app container not running" });
} catch (e) {
  rows.push({ source: "docker compose logs app", result: "ERROR", detail: (e as Error).message.split("\n")[0] });
}
if (logFile) {
  try { record(`log file ${logFile}`, readFileSync(logFile)); }
  catch (e) { rows.push({ source: `log file ${logFile}`, result: "ERROR", detail: (e as NodeJS.ErrnoException).code ?? "read error" }); }
}

const w = Math.max(...rows.map((r) => r.source.length), 6);
console.log(`Canary leak scan (${canary.length}-char canary, forms: ${needles.map(([f]) => f).join(", ")})`);
console.log(`${"SOURCE".padEnd(w)}  RESULT  DETAIL`);
for (const r of rows) console.log(`${r.source.padEnd(w)}  ${r.result.padEnd(6)}  ${r.detail}`);
const fail = rows.some((r) => r.result === "FAIL"), err = rows.some((r) => r.result === "ERROR");
console.log(fail ? "OVERALL: FAIL" : err ? "OVERALL: ERROR" : "OVERALL: PASS");
process.exit(fail ? 1 : err ? 2 : 0);
