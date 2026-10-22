import { afterEach, describe, expect, it, vi } from "vitest";
import { VAULT_ENCRYPTION_TAG, type DocumentMetadata, type UploadInitRequest } from "@/lib/vault/contracts";
import { frame, fromBase64, sha256Hex, toBase64, unframe } from "@/lib/vault/client/bytes";
import { createTideVaultCipher, frameTideOutput, unframeTideOutput, type TideCryptoFns } from "@/lib/vault/client/tide-cipher";
import { createDemoVaultCipher, memoryKeyStore } from "@/lib/vault/client/demo-cipher";
import type { VaultCipher } from "@/lib/vault/client/cipher";
import { decryptDocument, uploadFile, VaultFlowError, type FlowApi } from "@/lib/vault/client/vault-flow";

const enc = new TextEncoder();
const dec = new TextDecoder();
const contains = (hay: Uint8Array, needle: Uint8Array) => {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) { for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer; return true; }
  return false;
};

describe("bytes", () => {
  it("base64 round-trips arbitrary and large bytes", () => {
    for (const n of [0, 1, 2, 3, 255, 100_000]) {
      const b = new Uint8Array(n).map((_, i) => (i * 7 + 3) & 0xff);
      expect(fromBase64(toBase64(b))).toEqual(b);
    }
    expect(toBase64(enc.encode("hello"))).toBe("aGVsbG8=");
  });
  it("frames and rejects bad frames", () => {
    const f = frame([0x02], new Uint8Array([9, 9]));
    expect(Array.from(f)).toEqual([1, 2, 9, 9]);
    expect(Array.from(unframe(f, 1).payload)).toEqual([9, 9]);
    expect(() => unframe(new Uint8Array([2, 2, 9]), 1)).toThrow("ciphertext_frame_invalid");
    expect(() => unframe(new Uint8Array([1]), 1)).toThrow();
  });
  it("sha256Hex matches known vector", async () => {
    expect(await sha256Hex(enc.encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

// Fake Tide: reversible transform, returns strings or Uint8Arrays, and checks the input type is preserved on decrypt.
function fakeTide(kind: "string" | "bytes") {
  const seen: unknown[] = [];
  const fns: TideCryptoFns = {
    doEncrypt: async (items) => items.map(({ data, tags }) => {
      expect(tags).toEqual([VAULT_ENCRYPTION_TAG]);
      const b = typeof data === "string" ? enc.encode(data) : data;
      const x = b.map((v) => v ^ 0x5a);
      return kind === "string" ? `CT:${toBase64(x)}` : x;
    }),
    doDecrypt: async (items) => items.map(({ encrypted }) => {
      seen.push(encrypted);
      const x = typeof encrypted === "string" ? fromBase64(encrypted.slice(3)) : encrypted;
      const p = x.map((v) => v ^ 0x5a);
      return kind === "string" ? dec.decode(p) : p;
    }),
  };
  return { fns, seen };
}

describe("tide cipher", () => {
  for (const kind of ["string", "bytes"] as const) {
    it(`round-trips when SDK returns ${kind}`, async () => {
      const { fns, seen } = fakeTide(kind);
      const c = createTideVaultCipher(fns);
      expect(c.format).toBe("tide-e2ee-v1");
      const plain = enc.encode("secret payload");
      const ct = await c.encryptBytes(plain);
      expect(ct[0]).toBe(0x01);
      expect(ct[1]).toBe(kind === "string" ? 0x02 : 0x01);
      expect(await c.decryptBytes(ct)).toEqual(plain);
      expect(kind === "string" ? typeof seen[0] === "string" : seen[0] instanceof Uint8Array).toBe(true);
      expect(await c.decryptText(await c.encryptText("report.pdf"))).toBe("report.pdf");
    });
  }
  it("frame helpers preserve type", () => {
    expect(unframeTideOutput(frameTideOutput("abc"))).toBe("abc");
    expect(unframeTideOutput(frameTideOutput(new Uint8Array([1, 2])))).toEqual(new Uint8Array([1, 2]));
  });
});

describe("demo cipher", () => {
  const prev = process.env.NEXT_PUBLIC_AUTH_MODE;
  afterEach(() => { process.env.NEXT_PUBLIC_AUTH_MODE = prev; });
  it("round-trips in development mode with in-memory key store", async () => {
    process.env.NEXT_PUBLIC_AUTH_MODE = "development";
    const store = memoryKeyStore();
    const c = createDemoVaultCipher(store);
    expect(c.format).toBe("demo-not-e2ee-v1");
    const plain = enc.encode("demo secret");
    const ct = await c.encryptBytes(plain);
    expect(ct[0]).toBe(1);
    expect(ct.length).toBe(1 + 12 + plain.length + 16);
    expect(await createDemoVaultCipher(store).decryptBytes(ct)).toEqual(plain);
    expect(await c.decryptText(await c.encryptText("name.txt"))).toBe("name.txt");
    expect((await store.get())?.extractable).toBe(false);
  });
  it("throws outside development mode", () => {
    for (const mode of ["tidecloak", undefined, "production"]) {
      if (mode === undefined) delete process.env.NEXT_PUBLIC_AUTH_MODE; else process.env.NEXT_PUBLIC_AUTH_MODE = mode;
      expect(() => createDemoVaultCipher(memoryKeyStore())).toThrow("demo_cipher_disabled");
    }
  });
});

describe("vault flow", () => {
  const CANARY = "CANARY-7f3e9a-PLAINTEXT";
  const NAME_CANARY = "CANARY-NAME-b41c.txt";
  // Simple reversible cipher that clearly hides the canary.
  const cipher: VaultCipher = {
    format: "tide-e2ee-v1",
    encryptBytes: async (b) => frame([0x01], b.map((v) => v ^ 0xa5)),
    decryptBytes: async (c) => unframe(c, 1).payload.map((v) => v ^ 0xa5),
    encryptText: async (s) => toBase64(enc.encode(s).map((v) => v ^ 0xa5)),
    decryptText: async (s) => dec.decode(fromBase64(s).map((v) => v ^ 0xa5)),
  };
  const meta = (over: Partial<DocumentMetadata> = {}): DocumentMetadata => ({
    id: "doc1", organizationId: "org1", ownerId: "u1", ownerDisplayName: "Alice", classification: "INTERNAL", declaredContentType: "text/plain",
    ciphertextFormat: "tide-e2ee-v1", encryptionPolicyTag: "vault", size: 0, hash: "", encryptedName: null, version: 1, status: "AVAILABLE",
    createdAt: new Date(0).toISOString(), committedAt: null, ...over,
  });

  function fakeApi() {
    const calls: { init?: UploadInitRequest; uploaded?: Uint8Array; stored?: Uint8Array } = {};
    const api: FlowApi = {
      uploadInit: vi.fn(async (_org, req) => { calls.init = req; return { document: meta({ id: "doc1" }), upload: { url: "http://s3/upload", fields: { key: "k" }, expiresAt: "" } }; }),
      uploadCiphertext: vi.fn(async (_t, bytes) => { calls.uploaded = bytes; calls.stored = bytes; }),
      commit: vi.fn(async () => ({ document: meta({ size: calls.stored!.length }) })),
      issueDownload: vi.fn(async () => ({ download: { url: "http://s3/download", expiresAt: "" } })),
      fetchCiphertext: vi.fn(async () => calls.stored!),
    };
    return { api, calls };
  }
  const fileOf = (content: string, name = NAME_CANARY, type = "text/plain") => {
    const b = enc.encode(content);
    return { name, type, size: b.length, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer };
  };

  it("uploads only ciphertext, encrypted name, and ciphertext hash", async () => {
    const { api, calls } = fakeApi();
    const plaintext = `header ${CANARY} footer`;
    await uploadFile(cipher, api, "org1", fileOf(plaintext), "CONFIDENTIAL");
    const everything = enc.encode(JSON.stringify(calls.init) + dec.decode(calls.uploaded));
    expect(contains(calls.uploaded!, enc.encode(CANARY))).toBe(false);
    expect(contains(everything, enc.encode(CANARY))).toBe(false);
    expect(contains(everything, enc.encode(NAME_CANARY))).toBe(false);
    expect(JSON.stringify(calls.init)).not.toContain(toBase64(enc.encode(CANARY)));
    expect(calls.init!.ciphertextSha256).toBe(await sha256Hex(calls.uploaded!));
    expect(calls.init!.ciphertextSha256).not.toBe(await sha256Hex(enc.encode(plaintext)));
    expect(calls.init!.ciphertextSize).toBe(calls.uploaded!.length);
    expect(calls.init).toMatchObject({ classification: "CONFIDENTIAL", declaredContentType: "text/plain", ciphertextFormat: "tide-e2ee-v1", encryptionPolicyTag: "vault" });
    expect(await cipher.decryptText(calls.init!.encryptedName)).toBe(NAME_CANARY);
  });

  it("rejects disallowed types and oversized files before calling the api", async () => {
    const { api } = fakeApi();
    await expect(uploadFile(cipher, api, "o", fileOf("x", "a.exe", "application/x-msdownload"), "INTERNAL")).rejects.toThrow("unsupported_type");
    await expect(uploadFile(cipher, api, "o", { ...fileOf("x"), size: 6 * 1024 * 1024 }, "INTERNAL")).rejects.toThrow("file_too_large");
    expect(api.uploadInit).not.toHaveBeenCalled();
  });

  it("decrypts after verifying the ciphertext hash, and fails on mismatch", async () => {
    const { api, calls } = fakeApi();
    await uploadFile(cipher, api, "org1", fileOf(CANARY), "INTERNAL");
    const hash = await sha256Hex(calls.stored!);
    const blob = await decryptDocument(cipher, api, "org1", meta({ hash }));
    expect(blob.type).toBe("text/plain");
    expect(await blob.text()).toBe(CANARY);
    await expect(decryptDocument(cipher, api, "org1", meta({ hash: "0".repeat(64) }))).rejects.toBeInstanceOf(VaultFlowError);
  });
});
