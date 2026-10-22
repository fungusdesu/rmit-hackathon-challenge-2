import { randomBytes } from "node:crypto";

// Opaque object keys: no org id, user id or filename ever appears in storage paths.
const OBJECT_KEY_PATTERN = /^v1\/[A-Za-z0-9_-]{43}$/;

export function generateObjectKey(): string {
  return `v1/${randomBytes(32).toString("base64url")}`;
}

export function isValidObjectKey(key: unknown): key is string {
  return typeof key === "string" && OBJECT_KEY_PATTERN.test(key);
}
