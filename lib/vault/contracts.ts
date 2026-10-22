// Shared vault contract used by the storage adapter, API routes, browser client, and tests.
// The server only ever handles ciphertext bytes and the metadata declared here.

export const VAULT_ENCRYPTION_TAG = "vault";
export const TIDE_VAULT_ROLES = { encrypt: `_tide_${VAULT_ENCRYPTION_TAG}.selfencrypt`, decrypt: `_tide_${VAULT_ENCRYPTION_TAG}.selfdecrypt` } as const;

export const CIPHERTEXT_FORMATS = ["tide-e2ee-v1", "demo-not-e2ee-v1"] as const;
export type CiphertextFormat = (typeof CIPHERTEXT_FORMATS)[number];
export const DEMO_CIPHERTEXT_FORMAT: CiphertextFormat = "demo-not-e2ee-v1";

export const CLASSIFICATIONS = ["INTERNAL", "CONFIDENTIAL", "RESTRICTED"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

// Declared plaintext type. The server cannot verify it because it never sees plaintext.
export const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

// Every stored object is opaque ciphertext.
export const CIPHERTEXT_OBJECT_CONTENT_TYPE = "application/octet-stream";

export const DEFAULT_MAX_CIPHERTEXT_BYTES = 5 * 1024 * 1024;
export const HARD_MAX_CIPHERTEXT_BYTES = 10 * 1024 * 1024;
export const MAX_ENCRYPTED_NAME_LENGTH = 4096;
export const PENDING_UPLOAD_TTL_SECONDS = 15 * 60;
export const PRESIGNED_UPLOAD_TTL_SECONDS = 5 * 60;
export const PRESIGNED_DOWNLOAD_TTL_SECONDS = 60;
export const VAULT_RATE_LIMIT_PER_MINUTE = 30;

export function maxCiphertextBytes(): number {
  const configured = Number.parseInt(process.env.VAULT_MAX_CIPHERTEXT_BYTES ?? "", 10);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_MAX_CIPHERTEXT_BYTES;
  return Math.min(configured, HARD_MAX_CIPHERTEXT_BYTES);
}

export type DocumentStatus = "PENDING_UPLOAD" | "AVAILABLE" | "REJECTED";

// Never includes objectKey: storage locations stay server-side.
export type DocumentMetadata = {
  id: string;
  organizationId: string;
  ownerId: string;
  ownerDisplayName: string;
  classification: Classification;
  declaredContentType: AllowedContentType;
  ciphertextFormat: CiphertextFormat;
  encryptionPolicyTag: string;
  size: number;
  hash: string;
  encryptedName: string | null;
  version: number;
  status: DocumentStatus;
  createdAt: string;
  committedAt: string | null;
};

export type UploadInitRequest = {
  classification: Classification;
  declaredContentType: AllowedContentType;
  ciphertextSize: number;
  ciphertextSha256: string; // lowercase hex SHA-256 of the ciphertext bytes, never of plaintext
  ciphertextFormat: CiphertextFormat;
  encryptionPolicyTag: typeof VAULT_ENCRYPTION_TAG;
  encryptedName: string; // base64 ciphertext of the original filename
};

export type UploadTarget = { url: string; fields: Record<string, string>; expiresAt: string };
export type UploadInitResponse = { document: DocumentMetadata; upload: UploadTarget };
export type CommitResponse = { document: DocumentMetadata };
export type DocumentListResponse = { documents: DocumentMetadata[] };
export type DocumentResponse = { document: DocumentMetadata };
export type DownloadResponse = { download: { url: string; expiresAt: string } };

// Fixed error codes. Responses never echo user input.
export const VAULT_ERRORS = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_state: 409,
  payload_too_large: 413,
  unsupported_content_type: 415,
  integrity_mismatch: 422,
  rate_limited: 429,
  internal_error: 500,
  storage_unavailable: 503,
} as const;
export type VaultErrorCode = keyof typeof VAULT_ERRORS;
export type VaultErrorResponse = { error: VaultErrorCode };

export class VaultError extends Error {
  constructor(public readonly code: VaultErrorCode) {
    super(code);
  }
  get status() {
    return VAULT_ERRORS[this.code];
  }
}
