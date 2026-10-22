import type { CiphertextFormat } from "@/lib/vault/contracts";

export interface VaultCipher {
  format: CiphertextFormat;
  encryptBytes(b: Uint8Array): Promise<Uint8Array>;
  decryptBytes(c: Uint8Array): Promise<Uint8Array>;
  encryptText(s: string): Promise<string /* base64 */>;
  decryptText(b64: string): Promise<string>;
}
