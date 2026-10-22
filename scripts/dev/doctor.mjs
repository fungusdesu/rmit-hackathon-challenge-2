#!/usr/bin/env node
// BusinessVault environment doctor. Works on Windows and Linux. Never prints secret values.
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { REQUIRED_ENV, PORTS, parseNodeMajor, parseEnvFile, missingEnv, parseHostPort, formatTable, summarize } from "./doctor-lib.mjs";

const rows = [];
const add = (status, name, detail) => rows.push({ status, name, detail });

function tcp(host, port, timeout = 1500) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (ok) => { s.destroy(); resolve(ok); };
    s.setTimeout(timeout, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

const major = parseNodeMajor(process.version);
add(major >= 20 ? "PASS" : "FAIL", "Node >= 20", process.version);

await new Promise((resolve) => {
  execFile("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 8000 }, (err, stdout) => {
    if (err) add("FAIL", "Docker reachable", "docker info failed (is Docker Desktop / dockerd running?)");
    else add("PASS", "Docker reachable", stdout.trim() ? `server ${stdout.trim()}` : "ok");
    resolve();
  });
});

const portNames = { 3000: "app", 5432: "postgres", 9000: "minio", 8080: "tidecloak" };
for (const p of PORTS) {
  const open = await tcp("127.0.0.1", p, 800);
  const missingStatus = p === 3000 || p === 8080 ? "WARN" : "FAIL";
  add(open ? "PASS" : missingStatus, `Port ${p} (${portNames[p]})`, open ? "listening" : "nothing listening");
}

const fileEnv = existsSync(".env.local") ? parseEnvFile(readFileSync(".env.local", "utf8")) : null;
add(fileEnv ? "PASS" : "WARN", ".env.local present", fileEnv ? `${Object.keys(fileEnv).length} keys` : "not found (copy .env.example)");
const missing = missingEnv(REQUIRED_ENV, process.env, fileEnv);
add(missing.length ? "FAIL" : "PASS", "Required env vars", missing.length ? `missing: ${missing.join(", ")}` : "all present");

const env = { ...(fileEnv ?? {}), ...process.env };
const pg = parseHostPort(env.DATABASE_URL ?? "postgresql://localhost:5432/x", 5432);
if (pg) add((await tcp(pg.host, pg.port)) ? "PASS" : "FAIL", "Postgres reachable", `${pg.host}:${pg.port}`);
const s3 = parseHostPort(env.S3_ENDPOINT ?? "http://localhost:9000", 9000);
if (s3) {
  let ok = false;
  try {
    const r = await fetch(`http://${s3.host === "localhost" ? "127.0.0.1" : s3.host}:${s3.port}/minio/health/live`, { signal: AbortSignal.timeout(2000) });
    ok = r.ok;
  } catch {
    ok = false;
  }
  add(ok ? "PASS" : "FAIL", "MinIO reachable", `${s3.host}:${s3.port}`);
}

console.log(formatTable(rows));
const s = summarize(rows);
console.log(`\n${s.pass} pass, ${s.warn} warn, ${s.fail} fail`);
process.exitCode = s.fail ? 1 : 0;
