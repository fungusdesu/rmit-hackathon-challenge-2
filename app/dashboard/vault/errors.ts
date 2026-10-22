import { VaultApiError } from "@/lib/vault/client/api";
import { VaultFlowError } from "@/lib/vault/client/vault-flow";

const MESSAGES: Record<string, string> = {
  invalid_request: "The server rejected the request as invalid.",
  unauthorized: "You are not signed in, or your session expired. Sign in again.",
  forbidden: "Your organization role does not allow this action.",
  not_found: "Not found, or you are not a member of this organization.",
  invalid_state: "The document is not in a valid state for this action (the upload may have expired).",
  payload_too_large: "The file is larger than the 5 MiB limit.",
  unsupported_content_type: "This file type is not allowed.",
  integrity_mismatch: "Integrity check failed: the stored ciphertext does not match its recorded hash.",
  rate_limited: "Too many requests. Wait a minute and try again.",
  internal_error: "The server hit an internal error.",
  storage_unavailable: "Encrypted storage is unavailable right now.",
  network_error: "Network error: could not reach the server.",
  upload_failed: "Uploading the ciphertext to storage failed.",
  file_too_large: "The file is larger than the 5 MiB limit.",
  unsupported_type: "This file type is not allowed. Use PDF, TXT, CSV, JSON, PNG, JPEG, DOCX or XLSX.",
  encrypt_failed: "Encryption failed in the browser. Check that you hold the Tide vault encrypt role.",
  decrypt_failed: "Decryption failed. Only the uploader can decrypt (Tide self-decrypt), and you need the decrypt role.",
};

export function errorMessage(e: unknown): string {
  if (e instanceof VaultApiError || e instanceof VaultFlowError) return MESSAGES[e.code] ?? `Error: ${e.code}`;
  return "Unexpected error.";
}
