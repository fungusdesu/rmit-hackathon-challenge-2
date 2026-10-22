import {
  ALLOWED_CONTENT_TYPES,
  CIPHERTEXT_FORMATS,
  CLASSIFICATIONS,
  DEMO_CIPHERTEXT_FORMAT,
  MAX_ENCRYPTED_NAME_LENGTH,
  VAULT_ENCRYPTION_TAG,
  VaultError,
  maxCiphertextBytes,
  type UploadInitRequest,
} from "@/lib/vault/contracts";

const KEYS = [
  "classification",
  "declaredContentType",
  "ciphertextSize",
  "ciphertextSha256",
  "ciphertextFormat",
  "encryptionPolicyTag",
  "encryptedName",
] as const;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidVaultId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/** Malformed ids are indistinguishable from unknown ones, and are rejected before any DB query. */
export function assertVaultIds(...ids: unknown[]): void {
  for (const id of ids) if (!isValidVaultId(id)) throw new VaultError("not_found");
}

function includes<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

export function parseUploadInit(body: unknown): UploadInitRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new VaultError("invalid_request");
  const input = body as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!(KEYS as readonly string[]).includes(key)) throw new VaultError("invalid_request");
  }

  if (!includes(CLASSIFICATIONS, input.classification)) throw new VaultError("invalid_request");
  if (!includes(ALLOWED_CONTENT_TYPES, input.declaredContentType)) {
    throw new VaultError(typeof input.declaredContentType === "string" ? "unsupported_content_type" : "invalid_request");
  }

  const size = input.ciphertextSize;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 1) throw new VaultError("invalid_request");
  if (size > maxCiphertextBytes()) throw new VaultError("payload_too_large");

  if (typeof input.ciphertextSha256 !== "string" || !SHA256_HEX.test(input.ciphertextSha256)) throw new VaultError("invalid_request");

  if (!includes(CIPHERTEXT_FORMATS, input.ciphertextFormat)) throw new VaultError("invalid_request");
  if (input.ciphertextFormat === DEMO_CIPHERTEXT_FORMAT && process.env.AUTH_MODE !== "development") {
    throw new VaultError("invalid_request");
  }

  if (input.encryptionPolicyTag !== VAULT_ENCRYPTION_TAG) throw new VaultError("invalid_request");

  const name = input.encryptedName;
  if (typeof name !== "string" || name.length < 1 || name.length > MAX_ENCRYPTED_NAME_LENGTH || !BASE64.test(name)) {
    throw new VaultError("invalid_request");
  }

  return {
    classification: input.classification,
    declaredContentType: input.declaredContentType,
    ciphertextSize: size,
    ciphertextSha256: input.ciphertextSha256,
    ciphertextFormat: input.ciphertextFormat,
    encryptionPolicyTag: VAULT_ENCRYPTION_TAG,
    encryptedName: name,
  };
}
