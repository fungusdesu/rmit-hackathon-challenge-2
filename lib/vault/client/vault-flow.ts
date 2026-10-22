import {
  ALLOWED_CONTENT_TYPES, DEFAULT_MAX_CIPHERTEXT_BYTES, VAULT_ENCRYPTION_TAG,
  type AllowedContentType, type Classification, type DocumentMetadata,
} from "@/lib/vault/contracts";
import { sha256Hex } from "./bytes";
import type { VaultCipher } from "./cipher";
import type { VaultApi } from "./api";

export type FlowApi = Pick<VaultApi, "uploadInit" | "uploadCiphertext" | "commit" | "issueDownload" | "fetchCiphertext">;
export type FileLike = { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };
export type FlowErrorCode = "file_too_large" | "unsupported_type" | "integrity_mismatch" | "decrypt_failed" | "encrypt_failed";

export class VaultFlowError extends Error {
  constructor(public readonly code: FlowErrorCode) {
    super(code);
    this.name = "VaultFlowError";
  }
}

export const isAllowedType = (t: string): t is AllowedContentType => (ALLOWED_CONTENT_TYPES as readonly string[]).includes(t);

// Client-side pre-check only; the server enforces limits too.
export function checkFile(file: Pick<FileLike, "type" | "size">, maxBytes = DEFAULT_MAX_CIPHERTEXT_BYTES): AllowedContentType {
  if (!isAllowedType(file.type)) throw new VaultFlowError("unsupported_type");
  if (file.size > maxBytes) throw new VaultFlowError("file_too_large");
  return file.type;
}

export async function uploadFile(cipher: VaultCipher, api: FlowApi, orgId: string, file: FileLike, classification: Classification): Promise<DocumentMetadata> {
  const declaredContentType = checkFile(file);
  let ciphertext: Uint8Array, encryptedName: string;
  try {
    ciphertext = await cipher.encryptBytes(new Uint8Array(await file.arrayBuffer()));
    encryptedName = await cipher.encryptText(file.name);
  } catch {
    throw new VaultFlowError("encrypt_failed");
  }
  if (ciphertext.length > DEFAULT_MAX_CIPHERTEXT_BYTES) throw new VaultFlowError("file_too_large");
  const ciphertextSha256 = await sha256Hex(ciphertext); // hash of ciphertext, never plaintext
  const init = await api.uploadInit(orgId, {
    classification, declaredContentType, ciphertextSize: ciphertext.length, ciphertextSha256,
    ciphertextFormat: cipher.format, encryptionPolicyTag: VAULT_ENCRYPTION_TAG, encryptedName,
  });
  await api.uploadCiphertext(init.upload, ciphertext);
  return (await api.commit(orgId, init.document.id)).document;
}

export async function decryptDocument(cipher: VaultCipher, api: FlowApi, orgId: string, doc: DocumentMetadata): Promise<Blob> {
  const { download } = await api.issueDownload(orgId, doc.id);
  const ciphertext = await api.fetchCiphertext(download.url);
  if ((await sha256Hex(ciphertext)) !== doc.hash) throw new VaultFlowError("integrity_mismatch");
  let plain: Uint8Array;
  try { plain = await cipher.decryptBytes(ciphertext); } catch { throw new VaultFlowError("decrypt_failed"); }
  return new Blob([plain as BlobPart], { type: doc.declaredContentType });
}

export async function decryptName(cipher: VaultCipher, doc: DocumentMetadata): Promise<string> {
  if (!doc.encryptedName) return "(no name)";
  try { return await cipher.decryptText(doc.encryptedName); } catch { throw new VaultFlowError("decrypt_failed"); }
}
