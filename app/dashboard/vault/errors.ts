import { VaultApiError, type ClientErrorCode } from "@/lib/vault/client/api";
import { VaultFlowError, type FlowErrorCode } from "@/lib/vault/client/vault-flow";

// Exhaustive: adding a code to the contract without a message is a type error.
export const ERROR_MESSAGES: Record<ClientErrorCode | FlowErrorCode, string> = {
  invalid_request: "The server rejected the request as invalid.",
  unauthorized: "You are not signed in, or your session expired. Sign in again.",
  forbidden: "Your organization role does not allow this action.",
  not_found: "Not found, or you are not a member of this organization.",
  invalid_state: "The document is not in a valid state for this action (the upload may have expired). Try again.",
  payload_too_large: "The file is larger than the 5 MiB limit.",
  unsupported_content_type: "This file type is not allowed.",
  integrity_mismatch: "Integrity check failed: the stored ciphertext does not match its recorded hash.",
  rate_limited: "Too many requests. Wait a minute and try again.",
  internal_error: "The server hit an internal error. Try again shortly.",
  authentication_not_configured: "Sign-in is not configured on this server. Ask an administrator to set up TideCloak.",
  storage_unavailable: "Encrypted storage is unavailable right now. Try again shortly.",
  network_error: "Network error: could not reach the server or storage. Check your connection.",
  upload_failed: "Uploading the ciphertext to storage failed.",
  file_too_large: "The file is larger than the 5 MiB limit.",
  unsupported_type: "This file type is not allowed. Use PDF, TXT, CSV, JSON, PNG, JPEG, DOCX or XLSX.",
  encrypt_failed: "Encryption failed in the browser. Check that you hold the Tide vault encrypt role.",
  decrypt_failed: "Decryption failed. Only the uploader can decrypt (Tide self-decrypt), and you need the decrypt role.",
};

export function errorMessage(e: unknown): string {
  if (e instanceof VaultApiError || e instanceof VaultFlowError) return ERROR_MESSAGES[e.code] ?? `Error: ${e.code}`;
  if (e instanceof TypeError) return ERROR_MESSAGES.network_error; // fetch rejects with TypeError on network failure
  return "Unexpected error. Try again.";
}
