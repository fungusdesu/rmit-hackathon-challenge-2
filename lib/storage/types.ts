// Ciphertext-only object storage boundary. Implementations must never log keys or presigned URLs.

export type CreateUploadTargetInput = {
  objectKey: string;
  maxBytes: number;
  contentType: string;
  expiresInSeconds: number;
};

export type PresignedUpload = { url: string; fields: Record<string, string>; expiresAt: Date };
export type PresignedDownload = { url: string; expiresAt: Date };
export type ObjectHead = { size: number; contentType: string | null };

export interface ObjectStorage {
  createUploadTarget(input: CreateUploadTargetInput): Promise<PresignedUpload>;
  createDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<PresignedDownload>;
  /** Returns null when the object does not exist. */
  headObject(objectKey: string): Promise<ObjectHead | null>;
  getObjectBytes(objectKey: string): Promise<Uint8Array>;
  /** Server-side copy; used to move committed ciphertext to a key no upload policy can write. */
  copyObject(sourceKey: string, destinationKey: string): Promise<void>;
  deleteObject(objectKey: string): Promise<void>;
}

export class StorageUnavailableError extends Error {}
