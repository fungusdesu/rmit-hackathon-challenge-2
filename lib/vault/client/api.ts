import {
  CIPHERTEXT_OBJECT_CONTENT_TYPE, VAULT_ERRORS,
  type CommitResponse, type DocumentListResponse, type DocumentResponse, type DownloadResponse,
  type UploadInitRequest, type UploadInitResponse, type UploadTarget, type VaultErrorCode,
} from "@/lib/vault/contracts";

export type Organization = { id: string; name: string; slug?: string; [k: string]: unknown };
export type ClientErrorCode = VaultErrorCode | "network_error" | "upload_failed";

export class VaultApiError extends Error {
  constructor(public readonly code: ClientErrorCode, public readonly status: number) {
    super(code);
    this.name = "VaultApiError";
  }
}

export type VaultApiOptions = {
  getToken?: () => Promise<string | null>;
  devUser?: { subject: string; name: string } | null; // sent only in development mode
  fetchImpl?: typeof fetch;
};

export type VaultApi = ReturnType<typeof createVaultApi>;

const isCode = (v: unknown): v is VaultErrorCode => typeof v === "string" && v in VAULT_ERRORS;

export function createVaultApi(opts: VaultApiOptions = {}) {
  const f: typeof fetch = opts.fetchImpl ?? ((input, init) => fetch(input, init));

  async function headers(json: boolean): Promise<Headers> {
    const h = new Headers();
    if (json) h.set("Content-Type", "application/json");
    const token = await opts.getToken?.();
    if (token) h.set("Authorization", `Bearer ${token}`);
    if (process.env.NEXT_PUBLIC_AUTH_MODE === "development" && opts.devUser) {
      h.set("x-dev-user-subject", opts.devUser.subject);
      h.set("x-dev-user-name", opts.devUser.name);
    }
    return h;
  }

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await f(path, { method, headers: await headers(body !== undefined), body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
    } catch {
      throw new VaultApiError("network_error", 0);
    }
    const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
    if (!res.ok) throw new VaultApiError(isCode(data?.error) ? data.error : "internal_error", res.status);
    return data as T;
  }

  const docs = (orgId: string) => `/api/organizations/${encodeURIComponent(orgId)}/documents`;
  const doc = (orgId: string, id: string) => `${docs(orgId)}/${encodeURIComponent(id)}`;

  return {
    listOrganizations: () => call<{ organizations: Organization[] }>("GET", "/api/organizations"),
    listDocuments: (orgId: string) => call<DocumentListResponse>("GET", docs(orgId)),
    uploadInit: (orgId: string, req: UploadInitRequest) => call<UploadInitResponse>("POST", `${docs(orgId)}/upload-init`, req),
    commit: (orgId: string, id: string) => call<CommitResponse>("POST", `${doc(orgId, id)}/commit`, {}),
    getDocument: (orgId: string, id: string) => call<DocumentResponse>("GET", doc(orgId, id)),
    issueDownload: (orgId: string, id: string) => call<DownloadResponse>("POST", `${doc(orgId, id)}/download`, {}),
    async uploadCiphertext(target: UploadTarget, bytes: Uint8Array): Promise<void> {
      const form = new FormData();
      for (const [k, v] of Object.entries(target.fields)) form.append(k, v);
      form.append("file", new Blob([bytes as BlobPart], { type: CIPHERTEXT_OBJECT_CONTENT_TYPE }));
      let res: Response;
      try { res = await f(target.url, { method: "POST", body: form }); } catch { throw new VaultApiError("network_error", 0); }
      if (!res.ok) throw new VaultApiError(res.status === 413 ? "payload_too_large" : "upload_failed", res.status);
    },
    async fetchCiphertext(url: string): Promise<Uint8Array> {
      let res: Response;
      try { res = await f(url, { cache: "no-store" }); } catch { throw new VaultApiError("network_error", 0); }
      if (!res.ok) throw new VaultApiError(res.status === 404 ? "not_found" : "storage_unavailable", res.status);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}
