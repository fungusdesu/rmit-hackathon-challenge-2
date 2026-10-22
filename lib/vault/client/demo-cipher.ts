import { DEMO_CIPHERTEXT_FORMAT } from "@/lib/vault/contracts";
import { frame, fromBase64, toBase64, unframe } from "./bytes";
import type { VaultCipher } from "./cipher";

// DEMO ONLY: a local AES-GCM key in this browser. NOT end-to-end encrypted across users or devices.
export interface DemoKeyStore { get(): Promise<CryptoKey | undefined>; set(key: CryptoKey): Promise<void> }

export function memoryKeyStore(): DemoKeyStore {
  let key: CryptoKey | undefined;
  return { get: async () => key, set: async (k) => { key = k; } };
}

export function indexedDbKeyStore(dbName = "businessvault-demo", store = "keys", id = "vault-demo-key"): DemoKeyStore {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      });
    } finally { db.close(); }
  }
  return {
    get: () => run<CryptoKey | undefined>("readonly", (s) => s.get(id)),
    set: async (k) => { await run("readwrite", (s) => s.put(k, id)); },
  };
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function createDemoVaultCipher(keyStore?: DemoKeyStore): VaultCipher {
  if (process.env.NEXT_PUBLIC_AUTH_MODE !== "development") throw new Error("demo_cipher_disabled");
  const ks = keyStore ?? indexedDbKeyStore();
  let pending: Promise<CryptoKey> | undefined;
  const key = () => (pending ??= (async () => {
    const existing = await ks.get();
    if (existing) return existing;
    const k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await ks.set(k);
    return k;
  })());
  const encryptBytes = async (b: Uint8Array) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), b as BufferSource));
    return frame(iv, ct);
  };
  const decryptBytes = async (c: Uint8Array) => {
    const { header: iv, payload } = unframe(c, 12);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, await key(), payload as BufferSource));
  };
  return {
    format: DEMO_CIPHERTEXT_FORMAT,
    encryptBytes,
    decryptBytes,
    encryptText: async (s) => toBase64(await encryptBytes(enc.encode(s))),
    decryptText: async (b64) => dec.decode(await decryptBytes(fromBase64(b64))),
  };
}
