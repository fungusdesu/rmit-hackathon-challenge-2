import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://businessvault:businessvault@localhost:5432/businessvault";
process.env.S3_ENDPOINT ??= "http://localhost:9000";
process.env.S3_BUCKET ??= "businessvault";
process.env.S3_ACCESS_KEY_ID ??= "businessvault";
process.env.S3_SECRET_ACCESS_KEY ??= "businessvault-secret";

describe.skipIf(process.env.VAULT_IT !== "1")("system health (integration)", () => {
  it("reports real Postgres, migrations and MinIO without leaking secrets", async () => {
    const { getSystemHealth } = await import("@/lib/system-health");
    const started = Date.now();
    const health = await getSystemHealth();
    expect(Date.now() - started).toBeLessThan(3500);
    expect(health.database.status).toBe("ok");
    expect(health.migrations.status).toBe("ok");
    expect(health.migrations.applied).toBeGreaterThan(0);
    expect(["ok", "degraded"]).toContain(health.storage.status);
    const text = JSON.stringify(health);
    expect(text).not.toContain(process.env.S3_SECRET_ACCESS_KEY!);
    expect(text).not.toContain(process.env.S3_ENDPOINT!);
    expect(text).not.toContain("postgresql://");
  });

  it("reports storage down quickly for an unreachable endpoint", async () => {
    const { checkStorage } = await import("@/lib/system-health");
    const saved = process.env.S3_ENDPOINT;
    process.env.S3_ENDPOINT = "http://127.0.0.1:1";
    try {
      const result = await checkStorage();
      expect(result.status).toBe("down");
    } finally { process.env.S3_ENDPOINT = saved; }
  });
});
