import { VAULT_RATE_LIMIT_PER_MINUTE, VaultError } from "@/lib/vault/contracts";
import type { Principal } from "@/lib/auth/types";

// In-memory fixed-window limiter (per process). Adequate for a single-instance deployment.
const WINDOW_MS = 60_000;
const buckets = new Map<string, { windowStart: number; count: number }>();

export function enforceRateLimit(principal: Principal, action: string, now = Date.now()) {
  const key = `${principal.subject}\u0000${action}`;
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { windowStart: now, count: 1 });
    return;
  }
  if (bucket.count >= VAULT_RATE_LIMIT_PER_MINUTE) throw new VaultError("rate_limited");
  bucket.count += 1;
}

export function resetRateLimitsForTests() {
  buckets.clear();
}
