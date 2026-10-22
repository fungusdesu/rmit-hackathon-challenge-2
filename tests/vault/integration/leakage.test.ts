import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { VAULT_ERRORS } from "@/lib/vault/contracts";
import { demoEncrypt } from "../helpers/demo-encrypt";
import { as, createOrg, createUser, docsPath, initBody, prisma, seenResponses, skipIT, uploadDoc, type TestUser } from "../helpers/fixtures";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000", region: process.env.S3_REGION ?? "us-east-1", forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "businessvault", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "businessvault-secret" },
});
const BUCKET = process.env.S3_BUCKET ?? "businessvault";

function forms(c: string) {
  const b = Buffer.from(c, "utf8");
  return [c, b.toString("base64"), b.toString("base64url"), b.toString("hex"), c.toLowerCase()];
}
const KEY_RE = /v1\/[A-Za-z0-9_-]{43}/;

describe.skipIf(skipIT)("plaintext leakage", () => {
  const canary = `CANARY-${randomUUID()}`;
  const nameCanary = `NAMECANARY-${randomUUID()}.txt`;
  let owner: TestUser, org: string, docId: string;
  const start = seenResponses.length;

  beforeAll(async () => {
    owner = await createUser("leak");
    org = await createOrg(owner);
    const plaintext = `Quarterly secrets\n${canary}\n`.repeat(20);
    const ct = demoEncrypt(plaintext);
    docId = await uploadDoc(owner, org, ct, { encryptedName: demoEncrypt(nameCanary).toString("base64") });
    const c = as(owner), p = docsPath(org);
    await c.get(p); await c.get(`${p}/${docId}`); await c.post(`${p}/${docId}/download`, {});
    // Error paths that must not echo input.
    await c.post(`${p}/upload-init`, initBody(randomBytes(8), { declaredContentType: `text/${canary}` }));
    await c.post(`${p}/upload-init`, initBody(randomBytes(8), { classification: canary }));
    await c.post(`${p}/upload-init`, { [canary]: canary });
    await c.post(`${p}/${canary}/download`, {});
  });
  afterAll(() => s3.destroy());

  const responses = () => seenResponses.slice(start).filter((r) => r.path.includes("/documents"));
  const assertNoCanary = (hay: string, where: string) => {
    for (const f of [...forms(canary), ...forms(nameCanary)]) expect(hay.includes(f), `${where} contains canary form`).toBe(false);
  };

  it("canary absent from Document row and AuditEvents", async () => {
    const docs = await prisma.document.findMany({ where: { organizationId: org } });
    expect(docs.length).toBeGreaterThan(0);
    assertNoCanary(JSON.stringify(docs), "Document rows");
    const events = await prisma.auditEvent.findMany({ where: { organizationId: org } });
    assertNoCanary(JSON.stringify(events), "AuditEvent rows");
  });

  it("canary absent from every object in MinIO", async () => {
    let token: string | undefined, count = 0;
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }));
      for (const o of page.Contents ?? []) {
        const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: o.Key! }));
        const bytes = Buffer.from(await obj.Body!.transformToByteArray());
        count++;
        for (const f of forms(canary)) expect(bytes.includes(Buffer.from(f)), `object contains canary`).toBe(false);
        expect(bytes.includes(Buffer.from(canary, "utf16le"))).toBe(false);
      }
      token = page.NextContinuationToken;
    } while (token);
    expect(count).toBeGreaterThan(0);
  });

  it("canary and object keys absent from all API responses", () => {
    expect(responses().length).toBeGreaterThan(5);
    for (const r of responses()) {
      assertNoCanary(r.text, `response ${r.status}`);
      expect(r.text).not.toMatch(/"objectKey"/);
      // Presigned URLs legitimately carry the key in their path; strip them before checking.
      const stripped = r.text.replace(/"url":"[^"]*"/g, '"url":""').replace(/"fields":\{[^}]*\}/g, '"fields":{}');
      expect(stripped).not.toMatch(KEY_RE);
    }
  });

  it("error responses are exactly { error: <code> }", () => {
    const errs = responses().filter((r) => r.status >= 400);
    expect(errs.length).toBeGreaterThan(3);
    for (const r of errs) {
      expect(Object.keys(r.body ?? {})).toEqual(["error"]);
      expect(Object.keys(VAULT_ERRORS)).toContain(r.body.error);
      expect(VAULT_ERRORS[r.body.error as keyof typeof VAULT_ERRORS]).toBe(r.status);
    }
  });

  it("vault responses carry Cache-Control: no-store", () => {
    for (const r of responses()) expect(r.headers.get("cache-control") ?? "", `status ${r.status}`).toContain("no-store");
  });
});
