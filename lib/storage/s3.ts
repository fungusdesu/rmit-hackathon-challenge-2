import type { ObjectStorage } from "./types";

// Placeholder: the Storage agent replaces this with the MinIO/S3 implementation.
export function createS3Storage(): ObjectStorage {
  throw new Error("S3 storage adapter is not implemented yet");
}
