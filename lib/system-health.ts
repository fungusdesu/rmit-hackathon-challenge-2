import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { getTideConfig } from "@/lib/tide/config";

// Returns only statuses and short fixed strings: never endpoints, keys or SDK messages.
export type CheckStatus = "ok" | "degraded" | "down" | "not_configured";
export type HealthCheck = { status: CheckStatus; detail: string };
export type SystemHealth = {
  authMode: string;
  appVersion: string;
  checkedAt: string;
  tide: HealthCheck & { realmConfigured: boolean; clientConfigured: boolean; vendorIdPresent: boolean };
  database: HealthCheck;
  storage: HealthCheck;
  migrations: HealthCheck & { applied: number | null };
};

const TIMEOUT_MS = 2500;

function withTimeout<T>(promise: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}

const failure = (e: unknown) => (e instanceof Error && e.message === "timeout" ? "Timed out" : "Unreachable");

let cachedVersion: string | null = null;
function appVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version?: unknown };
    cachedVersion = typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch { cachedVersion = "unknown"; }
  return cachedVersion;
}

export function checkTide(): SystemHealth["tide"] {
  const realmConfigured = !!process.env.TIDECLOAK_REALM;
  const clientConfigured = !!process.env.TIDECLOAK_CLIENT_ID;
  const config = getTideConfig() as Record<string, unknown> | null;
  const vendorIdPresent = !!config && typeof config.vendorId === "string" && config.vendorId.length > 0;
  if (!config) return { status: "not_configured", detail: "TideCloak realm/client not configured", realmConfigured, clientConfigured, vendorIdPresent };
  if (!vendorIdPresent) return { status: "degraded", detail: "Adapter is missing vendorId", realmConfigured, clientConfigured, vendorIdPresent };
  return { status: "ok", detail: "Realm, client and vendorId present", realmConfigured, clientConfigured, vendorIdPresent };
}

export async function checkDatabase(): Promise<HealthCheck> {
  try { await withTimeout(db.$queryRaw`SELECT 1`); return { status: "ok", detail: "SELECT 1 succeeded" }; }
  catch (e) { return { status: "down", detail: failure(e) }; }
}

export async function checkMigrations(): Promise<SystemHealth["migrations"]> {
  try {
    const rows = await withTimeout(db.$queryRaw<{ count: bigint | number }[]>`SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`);
    const applied = Number(rows[0]?.count ?? 0);
    return { status: applied > 0 ? "ok" : "degraded", detail: `${applied} applied`, applied };
  } catch (e) { return { status: "down", detail: failure(e), applied: null }; }
}

export async function checkStorage(): Promise<HealthCheck> {
  const { S3_ENDPOINT: endpoint, S3_BUCKET: bucket, S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey } = process.env;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return { status: "not_configured", detail: "Object storage not configured" };
  const client = new S3Client({ endpoint, region: process.env.S3_REGION || "us-east-1", credentials: { accessKeyId, secretAccessKey }, forcePathStyle: true, maxAttempts: 1 });
  try {
    await withTimeout(client.send(new HeadBucketCommand({ Bucket: bucket })));
    return { status: "ok", detail: "Bucket reachable" };
  } catch (e) {
    const code = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (code === 404) return { status: "degraded", detail: "Bucket not created yet" };
    if (code === 403) return { status: "degraded", detail: "Access denied" };
    return { status: "down", detail: failure(e) };
  } finally { client.destroy(); }
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const [database, storage, migrations] = await Promise.all([checkDatabase(), checkStorage(), checkMigrations()]);
  return { authMode: process.env.AUTH_MODE === "development" ? "development" : "tide", appVersion: appVersion(), checkedAt: new Date().toISOString(), tide: checkTide(), database, storage, migrations };
}
