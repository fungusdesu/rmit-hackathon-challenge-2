import { afterEach, describe, expect, it } from "vitest";
import { VAULT_ERRORS, type UploadInitRequest } from "@/lib/vault/contracts";
import { createVaultApi, VaultApiError } from "@/lib/vault/client/api";

type Call = { url: string; init: RequestInit };
function fakeFetch(respond: (url: string) => Response | Promise<Response> = () => Response.json({})) {
  const calls: Call[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return respond(String(input));
  }) as typeof fetch;
  return { f, calls };
}
const hdr = (c: Call) => new Headers(c.init.headers);
const STORAGE = "http://localhost:9000/businessvault";
const SECRET = "CANARY-SECRET-NAME.pdf";
const req: UploadInitRequest = {
  classification: "INTERNAL", declaredContentType: "application/pdf", ciphertextSize: 10, ciphertextSha256: "a".repeat(64),
  ciphertextFormat: "tide-e2ee-v1", encryptionPolicyTag: "vault", encryptedName: "ZW5jcnlwdGVk",
};
const codeOf = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as VaultApiError).code;

const prevMode = process.env.NEXT_PUBLIC_AUTH_MODE;
afterEach(() => { process.env.NEXT_PUBLIC_AUTH_MODE = prevMode; });

describe("api headers", () => {
  it("sends Bearer to our API, and no dev headers outside development", async () => {
    process.env.NEXT_PUBLIC_AUTH_MODE = "tidecloak";
    const { f, calls } = fakeFetch();
    const api = createVaultApi({ fetchImpl: f, getToken: async () => "tok123", devUser: { subject: "dev-alice", name: "A" } });
    await api.listDocuments("org1");
    expect(calls[0].url).toBe("/api/organizations/org1/documents");
    expect(hdr(calls[0]).get("authorization")).toBe("Bearer tok123");
    expect(hdr(calls[0]).get("x-dev-user-subject")).toBeNull();
    expect(calls[0].init.credentials).toBe("same-origin");
  });

  it("asks for a fresh token on every call", async () => {
    let n = 0;
    const { f, calls } = fakeFetch();
    const api = createVaultApi({ fetchImpl: f, getToken: async () => `t${++n}` });
    await api.listOrganizations();
    await api.listOrganizations();
    expect(calls.map((c) => hdr(c).get("authorization"))).toEqual(["Bearer t1", "Bearer t2"]);
  });

  it("sends dev headers only in development mode", async () => {
    process.env.NEXT_PUBLIC_AUTH_MODE = "development";
    const { f, calls } = fakeFetch();
    await createVaultApi({ fetchImpl: f, devUser: { subject: "dev-bob", name: "Bob" } }).listOrganizations();
    expect(hdr(calls[0]).get("x-dev-user-subject")).toBe("dev-bob");
    expect(hdr(calls[0]).get("authorization")).toBeNull();
  });

  it("never sends Authorization, dev headers or credentials to storage", async () => {
    process.env.NEXT_PUBLIC_AUTH_MODE = "development";
    const { f, calls } = fakeFetch(() => new Response(new Uint8Array([1, 2]), { status: 200 }));
    let tokenCalls = 0;
    const api = createVaultApi({ fetchImpl: f, getToken: async () => { tokenCalls++; return "tok"; }, devUser: { subject: "d", name: "d" } });
    await api.uploadCiphertext({ url: STORAGE, fields: { key: "k", policy: "p" }, expiresAt: "" }, new Uint8Array([9]));
    await api.fetchCiphertext(`${STORAGE}/obj?X-Amz-Signature=abc`);
    expect(tokenCalls).toBe(0);
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.init.credentials).toBe("omit");
      expect(hdr(c).get("authorization")).toBeNull();
      expect(hdr(c).get("x-dev-user-subject")).toBeNull();
    }
  });

  it("keeps API calls relative and encodes path segments", async () => {
    const { f, calls } = fakeFetch();
    await createVaultApi({ fetchImpl: f, getToken: async () => "tok" }).listDocuments("//evil.example/../a?b");
    expect(calls[0].url).toBe("/api/organizations/%2F%2Fevil.example%2F..%2Fa%3Fb/documents");
  });
});

describe("api errors", () => {
  for (const code of Object.keys(VAULT_ERRORS) as (keyof typeof VAULT_ERRORS)[]) {
    it(`maps ${code}`, async () => {
      const { f } = fakeFetch(() => Response.json({ error: code }, { status: VAULT_ERRORS[code] }));
      const err = await createVaultApi({ fetchImpl: f }).listOrganizations().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(VaultApiError);
      expect((err as VaultApiError).code).toBe(code);
      expect((err as VaultApiError).status).toBe(VAULT_ERRORS[code]);
    });
  }

  it("maps unknown bodies by status, and network failures", async () => {
    const api = (r: () => Response) => createVaultApi({ fetchImpl: fakeFetch(r).f });
    expect(await codeOf(api(() => new Response("x", { status: 429 })).listOrganizations())).toBe("rate_limited");
    expect(await codeOf(api(() => new Response("x", { status: 401 })).listOrganizations())).toBe("unauthorized");
    expect(await codeOf(api(() => new Response("x", { status: 502 })).listOrganizations())).toBe("internal_error");
    expect(await codeOf(api(() => Response.json({ error: "toString" }, { status: 400 })).listOrganizations())).toBe("internal_error");
    const net = createVaultApi({ fetchImpl: (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch });
    expect(await codeOf(net.listOrganizations())).toBe("network_error");
    expect(await codeOf(net.fetchCiphertext(STORAGE))).toBe("network_error");
  });

  it("maps storage failures", async () => {
    const api = (s: number) => createVaultApi({ fetchImpl: fakeFetch(() => new Response("", { status: s })).f });
    const t = { url: STORAGE, fields: {}, expiresAt: "" };
    expect(await codeOf(api(413).uploadCiphertext(t, new Uint8Array()))).toBe("payload_too_large");
    expect(await codeOf(api(403).uploadCiphertext(t, new Uint8Array()))).toBe("upload_failed");
    expect(await codeOf(api(503).uploadCiphertext(t, new Uint8Array()))).toBe("storage_unavailable");
    expect(await codeOf(api(404).fetchCiphertext(STORAGE))).toBe("not_found");
    expect(await codeOf(api(500).fetchCiphertext(STORAGE))).toBe("storage_unavailable");
  });
});

describe("api payloads", () => {
  it("appends policy fields before the file", async () => {
    const { f, calls } = fakeFetch();
    const fields = { key: "k", "Content-Type": "application/octet-stream", policy: "p", "X-Amz-Signature": "s" };
    await createVaultApi({ fetchImpl: f }).uploadCiphertext({ url: STORAGE, fields, expiresAt: "" }, new Uint8Array([1]));
    expect([...(calls[0].init.body as FormData).keys()]).toEqual([...Object.keys(fields), "file"]);
  });

  it("keeps document data out of URLs and query strings", async () => {
    const { f, calls } = fakeFetch(() => Response.json({ document: { id: "d1" }, upload: { url: STORAGE, fields: {} } }));
    const api = createVaultApi({ fetchImpl: f, getToken: async () => "tok" });
    await api.uploadInit("org1", { ...req, encryptedName: SECRET });
    await api.commit("org1", "d1");
    await api.issueDownload("org1", "d1");
    await api.getDocument("org1", "d1");
    for (const c of calls) {
      expect(c.url).not.toContain("?");
      expect(c.url).not.toContain(SECRET);
      expect(c.url).not.toContain(req.ciphertextSha256);
    }
    expect(JSON.parse(String(calls[0].init.body)).encryptedName).toBe(SECRET);
  });
});
