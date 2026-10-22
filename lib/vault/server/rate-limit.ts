import { VAULT_RATE_LIMIT_PER_MINUTE, VaultError } from "@/lib/vault/contracts";
import type { Principal } from "@/lib/auth/types";

// In-memory fixed-window limiter (per process). Adequate for a single-instance deployment.
const WINDOW_MS = 60_000;
const PRUNE_EVERY_MS = WINDOW_MS;
const buckets = new Map<string, { windowStart: number; count: number }>();
let lastPrune = 0;

// Drops expired windows so the map holds at most the keys active in the last minute.
export function pruneRateLimits(now = Date.now()) {
  lastPrune = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= WINDOW_MS) buckets.delete(key);
  }
}

export function enforceRateLimit(principal: Principal, action: string, now = Date.now()) {
  if (now - lastPrune >= PRUNE_EVERY_MS) pruneRateLimits(now);
  const key = `${principal.subject}\u0000${action}`;
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { windowStart: now, count: 1 });
    return;
  }
  if (bucket.count >= VAULT_RATE_LIMIT_PER_MINUTE) throw new VaultError("rate_limited");
  bucket.count += 1;
}

export function rateLimitBucketCountForTests() {
  return buckets.size;
}

export function resetRateLimitsForTests() {
  buckets.clear();
  lastPrune = 0;
}
