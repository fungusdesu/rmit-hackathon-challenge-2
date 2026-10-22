import { beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "@/lib/auth/types";
import { VAULT_RATE_LIMIT_PER_MINUTE, VaultError } from "@/lib/vault/contracts";
import { DOWNLOAD_ANOMALY_THRESHOLD, recordDownload, resetDownloadMonitorForTests } from "@/lib/vault/server/download-monitor";
import { enforceRateLimit, pruneRateLimits, rateLimitBucketCountForTests, resetRateLimitsForTests } from "@/lib/vault/server/rate-limit";

const who = (subject: string): Principal => ({ subject, displayName: subject, email: null, source: "development" });

describe("rate limiter", () => {
  beforeEach(() => resetRateLimitsForTests());

  it("limits downloads per minute and resets after the window", () => {
    const p = who("dl");
    const t = 1_000_000;
    for (let i = 0; i < VAULT_RATE_LIMIT_PER_MINUTE; i++) enforceRateLimit(p, "download", t);
    expect(() => enforceRateLimit(p, "download", t + 1)).toThrow(VaultError);
    enforceRateLimit(p, "upload-init", t + 1);
    enforceRateLimit(p, "download", t + 60_000);
  });

  it("prunes expired windows so the map stays bounded", () => {
    const t = 5_000_000;
    for (let i = 0; i < 500; i++) enforceRateLimit(who(`u${i}`), "download", t);
    expect(rateLimitBucketCountForTests()).toBe(500);
    enforceRateLimit(who("late"), "download", t + 60_000);
    expect(rateLimitBucketCountForTests()).toBe(1);
    pruneRateLimits(t + 120_000);
    expect(rateLimitBucketCountForTests()).toBe(0);
  });
});

describe("download anomaly monitor", () => {
  beforeEach(() => resetDownloadMonitorForTests());

  it("alerts once when crossing the threshold within 10 minutes", () => {
    const t = 1_000_000;
    const results = Array.from({ length: 25 }, (_, i) => recordDownload("org", "user", t + i * 1000));
    const alerts = results.filter((r) => r !== null);
    expect(alerts).toEqual([DOWNLOAD_ANOMALY_THRESHOLD + 1]);
    expect(results.indexOf(DOWNLOAD_ANOMALY_THRESHOLD + 1)).toBe(DOWNLOAD_ANOMALY_THRESHOLD);
  });

  it("keys by organization and user", () => {
    const t = 1_000_000;
    for (let i = 0; i < DOWNLOAD_ANOMALY_THRESHOLD; i++) {
      expect(recordDownload("org", "a", t)).toBeNull();
      expect(recordDownload("org", "b", t)).toBeNull();
      expect(recordDownload("org2", "a", t)).toBeNull();
    }
    expect(recordDownload("org", "a", t)).not.toBeNull();
    expect(recordDownload("org", "b", t)).not.toBeNull();
  });

  it("downloads spread beyond the rolling window do not alert", () => {
    for (let i = 0; i < 50; i++) expect(recordDownload("org", "slow", i * 61_000)).toBeNull();
  });

  it("can alert again in a later window", () => {
    const t = 1_000_000;
    let alerts = 0;
    for (let i = 0; i < 12; i++) if (recordDownload("org", "u", t + i) !== null) alerts++;
    for (let i = 0; i < 12; i++) if (recordDownload("org", "u", t + 700_000 + i) !== null) alerts++;
    expect(alerts).toBe(2);
  });
});
