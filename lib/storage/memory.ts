import type { CreateUploadTargetInput, ObjectHead, ObjectStorage, PresignedDownload, PresignedUpload } from "./types";

// In-memory ciphertext store for tests only. Never wired into production code paths.
export type MemoryStorage = ObjectStorage & {
  putObject(objectKey: string, bytes: Uint8Array, contentType?: string): void;
  has(objectKey: string): boolean;
  keys(): string[];
};

export function createMemoryStorage(): MemoryStorage {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string | null }>();

  return {
    async createUploadTarget(input: CreateUploadTargetInput): Promise<PresignedUpload> {
      return {
        url: `memory://upload/${input.objectKey}`,
        fields: { key: input.objectKey, "Content-Type": input.contentType },
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      };
    },
    async createDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<PresignedDownload> {
      return { url: `memory://download/${objectKey}`, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
    },
    async headObject(objectKey: string): Promise<ObjectHead | null> {
      const object = objects.get(objectKey);
      return object ? { size: object.bytes.byteLength, contentType: object.contentType } : null;
    },
    async getObjectBytes(objectKey: string): Promise<Uint8Array> {
      const object = objects.get(objectKey);
      if (!object) throw new Error("object_not_found");
      return object.bytes;
    },
    async deleteObject(objectKey: string): Promise<void> {
      objects.delete(objectKey);
    },
    putObject(objectKey, bytes, contentType = "application/octet-stream") {
      objects.set(objectKey, { bytes, contentType });
    },
    has: (objectKey) => objects.has(objectKey),
    keys: () => [...objects.keys()],
  };
}
