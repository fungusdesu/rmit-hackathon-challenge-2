import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageUnavailableError, type ObjectStorage } from "./types";

type S3Config = { endpoint: string; publicEndpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string; region: string };

function readConfig(): S3Config {
  const env = process.env;
  const endpoint = env.S3_ENDPOINT;
  const bucket = env.S3_BUCKET;
  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new StorageUnavailableError("Object storage is not configured");
  return { endpoint, publicEndpoint: env.S3_PUBLIC_ENDPOINT || endpoint, bucket, accessKeyId, secretAccessKey, region: env.S3_REGION || "us-east-1" };
}

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } } | null;
  return !!e && (e.$metadata?.httpStatusCode === 404 || e.name === "NotFound" || e.name === "NoSuchKey" || e.name === "NoSuchBucket" || e.Code === "NoSuchKey");
}

// Never surface SDK messages: they can include keys, URLs or endpoints.
function unavailable(error: unknown): never {
  if (error instanceof StorageUnavailableError) throw error;
  throw new StorageUnavailableError("Object storage request failed");
}

export function createS3Storage(): ObjectStorage {
  let state: { config: S3Config; internal: S3Client; signer: S3Client } | null = null;
  let bucketReady: Promise<void> | null = null;

  // Lazy: `next build` imports this module without storage env present.
  function clients() {
    if (state) return state;
    const config = readConfig();
    const credentials = { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey };
    const make = (endpoint: string) => new S3Client({ endpoint, region: config.region, credentials, forcePathStyle: true });
    // `signer` targets the browser-facing host and is used only for presigning.
    state = { config, internal: make(config.endpoint), signer: make(config.publicEndpoint) };
    return state;
  }

  async function ensureBucket() {
    const { config, internal } = clients();
    bucketReady ??= (async () => {
      try {
        await internal.send(new HeadBucketCommand({ Bucket: config.bucket }));
      } catch (error) {
        if (!isNotFound(error)) throw error;
        await internal.send(new CreateBucketCommand({ Bucket: config.bucket }));
      }
    })().catch((error) => {
      bucketReady = null;
      unavailable(error);
    });
    await bucketReady;
    return clients();
  }

  return {
    async createUploadTarget({ objectKey, maxBytes, contentType, expiresInSeconds }) {
      const { config, signer } = await ensureBucket();
      try {
        const { url, fields } = await createPresignedPost(signer, {
          Bucket: config.bucket,
          Key: objectKey,
          Fields: { "Content-Type": contentType },
          Conditions: [["content-length-range", 1, maxBytes], ["eq", "$Content-Type", contentType]],
          Expires: expiresInSeconds,
        });
        return { url, fields, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
      } catch (error) {
        unavailable(error);
      }
    },
    async createDownloadUrl(objectKey, expiresInSeconds) {
      const { config, signer } = await ensureBucket();
      try {
        const command = new GetObjectCommand({
          Bucket: config.bucket,
          Key: objectKey,
          ResponseContentType: "application/octet-stream",
          ResponseCacheControl: "no-store",
          ResponseContentDisposition: "attachment",
        });
        const url = await getSignedUrl(signer, command, { expiresIn: expiresInSeconds });
        return { url, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
      } catch (error) {
        unavailable(error);
      }
    },
    async headObject(objectKey) {
      const { config, internal } = await ensureBucket();
      try {
        const head = await internal.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }));
        return { size: head.ContentLength ?? 0, contentType: head.ContentType ?? null };
      } catch (error) {
        if (isNotFound(error)) return null;
        unavailable(error);
      }
    },
    async getObjectBytes(objectKey) {
      const { config, internal } = await ensureBucket();
      try {
        const object = await internal.send(new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }));
        if (!object.Body) throw new StorageUnavailableError("Object storage returned no body");
        return await object.Body.transformToByteArray();
      } catch (error) {
        unavailable(error);
      }
    },
    async deleteObject(objectKey) {
      const { config, internal } = await ensureBucket();
      try {
        await internal.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }));
      } catch (error) {
        unavailable(error);
      }
    },
  };
}
