// Node mirror of the browser demo cipher format: [0x01][12-byte IV][AES-256-GCM ciphertext+tag].
import { createCipheriv, randomBytes } from "node:crypto";

export function demoEncrypt(plaintext: Uint8Array | string, key: Buffer = randomBytes(32)): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : Buffer.from(plaintext);
  const ct = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
  return Buffer.concat([Buffer.from([0x01]), iv, ct]);
}
