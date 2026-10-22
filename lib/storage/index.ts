import type { ObjectStorage } from "./types";
import { createS3Storage } from "./s3";

export type { ObjectStorage } from "./types";
export { StorageUnavailableError } from "./types";

const globalForStorage = globalThis as unknown as { vaultStorage?: ObjectStorage; vaultStorageOverride?: ObjectStorage | null };

export function getObjectStorage(): ObjectStorage {
  if (globalForStorage.vaultStorageOverride) return globalForStorage.vaultStorageOverride;
  globalForStorage.vaultStorage ??= createS3Storage();
  return globalForStorage.vaultStorage;
}

export function setObjectStorageForTests(storage: ObjectStorage | null) {
  globalForStorage.vaultStorageOverride = storage;
}
