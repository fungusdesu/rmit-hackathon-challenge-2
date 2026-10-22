import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "@/lib/storage/memory";

describe("memory storage", () => {
  it("stores, heads, reads and deletes", async () => {
    const storage = createMemoryStorage();
    expect(await storage.headObject("v1/x")).toBeNull();
    storage.putObject("v1/x", new Uint8Array([1, 2, 3]));
    expect(await storage.headObject("v1/x")).toEqual({ size: 3, contentType: "application/octet-stream" });
    expect(Array.from(await storage.getObjectBytes("v1/x"))).toEqual([1, 2, 3]);
    expect(storage.keys()).toEqual(["v1/x"]);
    await storage.deleteObject("v1/x");
    expect(storage.has("v1/x")).toBe(false);
    await expect(storage.getObjectBytes("v1/x")).rejects.toThrow();
  });

  it("returns upload and download targets with expiry", async () => {
    const storage = createMemoryStorage();
    const upload = await storage.createUploadTarget({ objectKey: "v1/y", maxBytes: 10, contentType: "application/octet-stream", expiresInSeconds: 60 });
    expect(upload.fields["Content-Type"]).toBe("application/octet-stream");
    expect(upload.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const download = await storage.createDownloadUrl("v1/y", 60);
    expect(download.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
