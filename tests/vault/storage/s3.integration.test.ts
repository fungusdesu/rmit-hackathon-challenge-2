import { beforeAll, describe, expect, it } from "vitest";
import type { ObjectStorage } from "@/lib/storage/types";

const CT = "application/octet-stream";

async function post(upload: { url: string; fields: Record<string, string> }, body: Uint8Array, contentType = CT) {
  const form = new FormData();
  for (const [name, value] of Object.entries(upload.fields)) form.append(name, name === "Content-Type" ? contentType : value);
  form.append("file", new Blob([body as BlobPart], { type: contentType }));
  return fetch(upload.url, { method: "POST", body: form });
}

describe.skipIf(process.env.VAULT_IT !== "1")("s3 storage (MinIO integration)", () => {
  let storage: ObjectStorage;
  let generateObjectKey: () => string;

  beforeAll(async () => {
    Object.assign(process.env, {
      S3_ENDPOINT: "http://localhost:9000",
      S3_PUBLIC_ENDPOINT: "http://localhost:9000",
      S3_BUCKET: "businessvault",
      S3_ACCESS_KEY_ID: "businessvault",
      S3_SECRET_ACCESS_KEY: "businessvault-secret",
      S3_REGION: "us-east-1",
    });
    ({ generateObjectKey } = await import("@/lib/storage/keys"));
    storage = (await import("@/lib/storage/s3")).createS3Storage();
  });

  const target = (objectKey: string, maxBytes = 64) => storage.createUploadTarget({ objectKey, maxBytes, contentType: CT, expiresInSeconds: 60 });

  it("uploads via presigned POST, round-trips, downloads and deletes", async () => {
    const key = generateObjectKey();
    const bytes = crypto.getRandomValues(new Uint8Array(48));
    const res = await post(await target(key), bytes);
    expect(res.status).toBeLessThan(300);
    expect((await storage.headObject(key))?.size).toBe(48);
    expect(Array.from(await storage.getObjectBytes(key))).toEqual(Array.from(bytes));

    const download = await storage.createDownloadUrl(key, 60);
    const url = new URL(download.url);
    expect(url.host).toBe("localhost:9000");
    expect(Number(url.searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(60);
    const got = await fetch(download.url);
    expect(got.status).toBe(200);
    expect(got.headers.get("content-disposition")).toBe("attachment");
    expect(Array.from(new Uint8Array(await got.arrayBuffer()))).toEqual(Array.from(bytes));

    await storage.deleteObject(key);
    expect(await storage.headObject(key)).toBeNull();
  });

  it("rejects a body larger than maxBytes", async () => {
    const key = generateObjectKey();
    const res = await post(await target(key, 16), new Uint8Array(17));
    expect(res.ok).toBe(false);
    expect(await storage.headObject(key)).toBeNull();
  });

  it("rejects a wrong Content-Type", async () => {
    const key = generateObjectKey();
    const res = await post(await target(key), new Uint8Array(8), "text/html");
    expect(res.ok).toBe(false);
    expect(await storage.headObject(key)).toBeNull();
  });

  it("returns null for a missing object", async () => {
    expect(await storage.headObject(generateObjectKey())).toBeNull();
  });
});
