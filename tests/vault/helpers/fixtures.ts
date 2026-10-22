import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient, type MembershipRole, type MembershipStatus } from "@prisma/client";
import { DEMO_CIPHERTEXT_FORMAT, VAULT_ENCRYPTION_TAG } from "@/lib/vault/contracts";

export const BASE_URL = (process.env.VAULT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
process.env.DATABASE_URL ??= "postgresql://businessvault:businessvault@localhost:5432/businessvault";
export const prisma = new PrismaClient();

export type TestUser = { id: string; subject: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Res = { path: string; status: number; body: any; text: string; headers: Headers };

// Every API response seen by tests, for leak assertions.
export const seenResponses: Res[] = [];

export async function createUser(label = "u"): Promise<TestUser> {
  const subject = `it-${label}-${randomUUID()}`;
  const user = await prisma.user.create({ data: { tideSubject: subject, displayName: `IT ${label}` } });
  return { id: user.id, subject };
}

export async function addMember(orgId: string, user: TestUser, role: MembershipRole, status: MembershipStatus = "ACTIVE") {
  await prisma.membership.create({ data: { organizationId: orgId, userId: user.id, role, status, joinedAt: new Date() } });
}

export function as(user: TestUser | null, extraHeaders: Record<string, string> = {}) {
  const req = async (method: string, path: string, body?: unknown, raw?: string): Promise<Res> => {
    const headers: Record<string, string> = { "content-type": "application/json", ...extraHeaders };
    if (user) Object.assign(headers, { "x-dev-user-subject": user.subject, "x-dev-user-name": "IT User", "x-dev-user-email": `${user.subject}@example.test` });
    const r = await fetch(`${BASE_URL}${path}`, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const text = await r.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    const res: Res = { path, status: r.status, body: parsed, text, headers: r.headers };
    seenResponses.push(res);
    return res;
  };
  return {
    get: (p: string) => req("GET", p),
    post: (p: string, body?: unknown) => req("POST", p, body ?? {}),
    postRaw: (p: string, raw: string) => req("POST", p, undefined, raw),
  };
}

export const docsPath = (orgId: string) => `/api/organizations/${orgId}/documents`;

export async function createOrg(owner: TestUser): Promise<string> {
  const r = await as(owner).post("/api/organizations", { name: `IT Org ${randomUUID().slice(0, 8)}` });
  if (r.status !== 201) throw new Error(`createOrg failed: ${r.status}`);
  return r.body.organization.id as string;
}

export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export function initBody(bytes: Uint8Array, overrides: Record<string, unknown> = {}) {
  return {
    classification: "INTERNAL",
    declaredContentType: "text/plain",
    ciphertextSize: bytes.length,
    ciphertextSha256: sha256(bytes),
    ciphertextFormat: DEMO_CIPHERTEXT_FORMAT,
    encryptionPolicyTag: VAULT_ENCRYPTION_TAG,
    encryptedName: randomBytes(32).toString("base64"),
    ...overrides,
  };
}

export async function postToStorage(upload: { url: string; fields: Record<string, string> }, bytes: Uint8Array) {
  const form = new FormData();
  for (const [k, v] of Object.entries(upload.fields)) form.append(k, v);
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }));
  try {
    const r = await fetch(upload.url, { method: "POST", body: form });
    await r.arrayBuffer();
    return r.status;
  } catch {
    return 0; // connection reset by storage counts as rejection
  }
}

export const initUpload = (user: TestUser, orgId: string, bytes: Uint8Array, overrides: Record<string, unknown> = {}) =>
  as(user).post(`${docsPath(orgId)}/upload-init`, initBody(bytes, overrides));

export const commit = (user: TestUser, orgId: string, docId: string) => as(user).post(`${docsPath(orgId)}/${docId}/commit`, {});

// init -> presigned POST -> commit. Returns the committed document id.
export async function uploadDoc(user: TestUser, orgId: string, bytes: Uint8Array = randomBytes(256), overrides: Record<string, unknown> = {}) {
  const init = await initUpload(user, orgId, bytes, overrides);
  if (init.status !== 201) throw new Error(`upload-init failed: ${init.status}`);
  const s = await postToStorage(init.body.upload, bytes);
  if (s < 200 || s >= 300) throw new Error(`storage POST failed: ${s}`);
  const c = await commit(user, orgId, init.body.document.id);
  if (c.status !== 200) throw new Error(`commit failed: ${c.status}`);
  return c.body.document.id as string;
}

export const skipIT = process.env.VAULT_IT !== "1";
