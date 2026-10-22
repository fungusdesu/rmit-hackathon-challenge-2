import { randomBytes } from "node:crypto";

// Temporary local copy of generateObjectKey from lib/storage/keys.ts (owned by Agent A). Swap the import once merged.
export function generateObjectKey(): string {
  return "v1/" + randomBytes(32).toString("base64url");
}
