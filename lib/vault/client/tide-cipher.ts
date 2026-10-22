import { VAULT_ENCRYPTION_TAG } from "@/lib/vault/contracts";
import { frame, fromBase64, toBase64, unframe } from "./bytes";
import type { VaultCipher } from "./cipher";

type Out = string | Uint8Array;
export type TideCryptoFns = {
  doEncrypt(data: { data: string | Uint8Array; tags: string[] }[]): Promise<Out[]>;
  doDecrypt(data: { encrypted: string | Uint8Array; tags: string[] }[]): Promise<Out[]>;
};

const KIND_BYTES = 0x01;
const KIND_STRING = 0x02;
const enc = new TextEncoder();
const dec = new TextDecoder();
const tags = [VAULT_ENCRYPTION_TAG];

// Frame: [0x01 version][kind][payload]; kind records which type the SDK returned so decrypt hands it back unchanged.
export function frameTideOutput(out: Out): Uint8Array {
  return typeof out === "string" ? frame([KIND_STRING], enc.encode(out)) : frame([KIND_BYTES], out);
}

export function unframeTideOutput(framed: Uint8Array): Out {
  const { header, payload } = unframe(framed, 1);
  if (header[0] === KIND_STRING) return dec.decode(payload);
  if (header[0] === KIND_BYTES) return payload.slice();
  throw new Error("ciphertext_frame_invalid");
}

const toBytes = (out: Out) => (typeof out === "string" ? enc.encode(out) : out);

export function createTideVaultCipher(fns: TideCryptoFns): VaultCipher {
  const encryptBytes = async (b: Uint8Array) => {
    const [out] = await fns.doEncrypt([{ data: b, tags }]);
    if (out === undefined) throw new Error("tide_encrypt_empty");
    return frameTideOutput(out);
  };
  const decryptBytes = async (c: Uint8Array) => {
    const [out] = await fns.doDecrypt([{ encrypted: unframeTideOutput(c), tags }]);
    if (out === undefined) throw new Error("tide_decrypt_empty");
    return toBytes(out);
  };
  return {
    format: "tide-e2ee-v1",
    encryptBytes,
    decryptBytes,
    encryptText: async (s) => toBase64(await encryptBytes(enc.encode(s))),
    decryptText: async (b64) => dec.decode(await decryptBytes(fromBase64(b64))),
  };
}
