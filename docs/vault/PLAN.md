# Vault & Encrypted Storage — Implementation Plan

Owner: Vault peer (Challenge 2, RMIT hackathon 2026). Deadline: **2026-10-22 16:00**.
Source handoff: `PEER_HANDOFF_VAULT.md` (gitignored). Spec: `BUSINESSVAULT_CODEX_SPEC.md` §7.3, §10, §13.

## 0. Decisions

| Topic | Decision |
|---|---|
| Tide realm | Local `tideorg/tidecloak-dev` on `:8080`, realm `nextjs-test`, client `myclient`. The user does the browser enrollment, licence and QEA approval steps. |
| Sharing model | **Uploader-only decrypt** unless the realm test proves otherwise. Shared org decrypt is documented as BLOCKED on Forseti policy-protected encryption (SDK docs say "coming soon"). |
| Schema | One **additive** migration on `Document`: a new enum and new nullable/defaulted columns, no renames or drops. Teammates are told before merge. |
| Git | `feat/vault` branch. Each agent works in its own worktree branch and the main session merges them. `origin/main` is merged in regularly. Nothing is pushed without the user's OK. |
| Tests | Vitest (unit + integration against Compose Postgres/MinIO), plus a canary leak-scan script. |

## 1. Verified facts (from the installed SDK `@tidecloak/js@0.14.34`, via `@tidecloak/nextjs@0.14.40`)

- `useTideCloak()` exposes `doEncrypt(data, decryptionPolicy?)` and `doDecrypt(data, decryptionPolicy?)`.
- `doEncrypt([{ data: string | Uint8Array, tags: string[] }]) → Promise<(string | Uint8Array)[]>`
- `doDecrypt([{ encrypted: string | Uint8Array, tags: string[] }]) → Promise<(string | Uint8Array)[]>`
- Output order matches input order. Objects must be serialised first.
- Required realm roles per tag: `_tide_<tag>.selfencrypt` and `_tide_<tag>.selfdecrypt`. Our tag is **`vault`**.
- Not available in hybrid mode. A signed policy (`Uint8Array`) replaces the role checks. Policy creation docs are "coming soon", so it is **NOT VERIFIED**.
- Still unknown, to be measured in the realm test: whether user B can decrypt user A's ciphertext, the maximum payload size, latency for 1 MB and 5 MB, and the output type for `Uint8Array` input.

## 2. Data flow

**Upload** (plaintext never leaves the browser):
1. The browser reads the file into a `Uint8Array`, calls `doEncrypt([{data: bytes, tags:["vault"]}, {data: filename, tags:["vault"]}])` and normalises the result to bytes.
2. The browser computes **SHA-256 of the ciphertext** with WebCrypto. It never hashes the plaintext, because that would allow equality and dictionary checks.
3. `POST /documents/upload-init` sends metadata only. The server validates it, creates a `Document` row with `status=PENDING_UPLOAD` and a random `objectKey`, and returns a **presigned POST**. The POST policy fixes `key`, `Content-Type=application/octet-stream` and `content-length-range`.
4. The browser POSTs the ciphertext directly to MinIO.
5. `POST /documents/:id/commit`: the server HEADs the object, checks the size, reads the ciphertext, checks its SHA-256, and moves the row to `AVAILABLE` (or `REJECTED` + deletes the object). This step is audited.

**Download/decrypt**:
1. `POST /documents/:id/download`: the server checks authorization and returns a presigned GET with a 60 s TTL and `Cache-Control: no-store`. This step is audited.
2. The browser fetches the ciphertext, checks the SHA-256, calls `doDecrypt`, and builds a `Blob` and object URL. The plaintext lives only in browser memory.

## 3. Data model (migration `vault_document_upload`)

```prisma
enum DocumentStatus { PENDING_UPLOAD AVAILABLE REJECTED }

model Document {
  // existing: id, organizationId, ownerId, objectKey, ciphertextFormat, encryptionPolicyTag,
  //           size (ciphertext bytes), hash (sha256 hex of ciphertext), classification, version
  status              DocumentStatus @default(PENDING_UPLOAD)
  declaredContentType String         @default("application/octet-stream")
  encryptedName       String?        // base64 Tide ciphertext of original filename
  uploadExpiresAt     DateTime?
  committedAt         DateTime?
  @@index([organizationId, status, createdAt])
}
```

Metadata stored in the clear (documented leakage): declared MIME type, ciphertext size, classification, uploader, timestamps. The filename is encrypted.

## 4. API contract (all under `/api/organizations/:organizationId/documents`)

| Method & path | Who | Body / result |
|---|---|---|
| `GET /` | any ACTIVE member | `{ documents: DocumentMetadata[] }`: AVAILABLE docs plus the caller's own PENDING ones |
| `POST /upload-init` | OWNER, ADMIN, MEMBER | `UploadInitRequest` → 201 `{ document, upload: { url, fields, expiresAt } }` |
| `POST /:documentId/commit` | uploader only | `{}` → 200 `{ document }` |
| `GET /:documentId` | any ACTIVE member | `{ document }` |
| `POST /:documentId/download` | uploader, OWNER, ADMIN | `{ download: { url, expiresAt } }` |

`UploadInitRequest = { classification, declaredContentType, ciphertextSize, ciphertextSha256, ciphertextFormat, encryptionPolicyTag, encryptedName }`

Error codes (fixed strings that never echo user input):
- `400 invalid_request`
- `401 unauthorized`
- `403 forbidden`: a member without the required role
- `404 not_found`: the response is **identical** for non-member, cross-tenant and unknown id
- `409 invalid_state`
- `413 payload_too_large`
- `415 unsupported_content_type`
- `422 integrity_mismatch`
- `429 rate_limited`
- `503 storage_unavailable`

`DocumentMetadata` **never** includes `objectKey`. Shared types live in `lib/vault/contracts.ts`.

## 5. Authorization matrix

| Role (ACTIVE) | List/metadata | Upload | Download ciphertext | Decrypt |
|---|---|---|---|---|
| OWNER | ✅ | ✅ | ✅ | Tide role + (uploader-only, pending the realm test) |
| ADMIN | ✅ | ✅ | ✅ | same |
| MEMBER | ✅ | ✅ | own docs only | same |
| AUDITOR | ✅ | ❌ 403 | ❌ 403 | ❌ |
| INVITED/SUSPENDED/REMOVED, other org, anonymous | 404 / 401 | 404 / 401 | 404 / 401 | ❌ |

The server re-checks membership on every call. React role checks are cosmetic only.

## 6. Storage design (`lib/storage/**`)

- `@aws-sdk/client-s3`, `@aws-sdk/s3-presigned-post` and `@aws-sdk/s3-request-presigner`, with `forcePathStyle` for MinIO.
- Two endpoints: `S3_ENDPOINT` (server→MinIO, e.g. `http://minio:9000`) and `S3_PUBLIC_ENDPOINT` (the URL the browser uses, e.g. `http://localhost:9000`). Presigned URLs are signed against the public endpoint.
- Object key: `v1/<base64url(32 random bytes)>`. There is no org id, filename or user id in the key.
- `ensureBucket()` runs lazily on first use. Compose gets a one-shot `minio-init` (mc) service that creates the bucket and sets CORS to `http://localhost:3000` only.
- Interface `ObjectStorage` lives in `lib/storage/types.ts` (foundation). It has `createUploadTarget`, `createDownloadUrl`, `headObject`, `getObjectBytes` and `deleteObject`. An in-memory implementation exists for unit tests.
- Presigned URLs are never logged.

## 7. Browser E2EE client (`lib/vault/client/**`, `app/dashboard/vault/**`)

- `VaultCipher` interface with `{ format, encryptBytes, decryptBytes, encryptText, decryptText }`.
  - `TideVaultCipher` wraps `useTideCloak().doEncrypt/doDecrypt` with tag `vault`. Format: `tide-e2ee-v1`.
  - `DemoVaultCipher` is WebCrypto AES-GCM with a non-extractable key in IndexedDB. Format: `demo-not-e2ee-v1`. It is enabled **only** when `NEXT_PUBLIC_AUTH_MODE=development`, the UI shows a red "DEMO — NOT E2EE" banner, and the **server rejects this format when `AUTH_MODE=tidecloak`** (fail closed).
- Vault page features: organization picker, document table (decrypted names shown only after the user clicks Decrypt), upload form (classification, file), and decrypt/save button.
- Status and error states use text plus colour (accessibility requirement). Styles go in `app/dashboard/vault/vault.module.css` (do not edit `globals.css`).
- Realm test panel at `/dashboard/vault/diagnostics`: runs the encrypt/decrypt round trip, measures 1 MB and 5 MB, reports the output types, and has a "paste ciphertext from another user" decrypt test.

## 8. Limits & validation (server-side, `lib/vault/contracts.ts`)

- `VAULT_MAX_CIPHERTEXT_BYTES` default **5 MiB** (env-overridable, hard cap 10 MiB). It is enforced at upload-init, again by the presigned POST `content-length-range`, and again at commit (HEAD + actual byte count).
- Declared content-type allowlist:
  - `application/pdf`, `text/plain`, `text/csv`, `application/json`
  - `image/png`, `image/jpeg`
  - docx: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - xlsx: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - Anything else → 415.
  - The stored object is always `application/octet-stream`. The server **cannot** verify the plaintext type, by design; this is documented.
- `classification ∈ {INTERNAL, CONFIDENTIAL, RESTRICTED}`, `encryptionPolicyTag === "vault"`, `ciphertextSha256` is 64 hex characters, `encryptedName` is base64 of at most 4096 characters.
- Pending upload TTL is 15 min. Commit after expiry → 409.
- A simple in-memory rate limit on upload-init and download: 30/min per principal (documented as single-instance only).

## 9. Plaintext-leakage controls

- The server only ever handles ciphertext bytes and metadata.
- No `console.log` of request bodies, presigned URLs or object keys. Errors return fixed codes.
- No query-string parameters carry document data. Download URL issuance is a POST with `Cache-Control: no-store`.
- No analytics SDK exists. A test asserts that none is added to the vault pages.
- `scripts/vault/leak-scan.ts <canary>` greps a `pg_dump`, every object in the bucket, and the app container logs for a canary string and its base64/hex forms. It exits non-zero on a hit. It is run after a live upload of a file containing the canary.

## 10. Work breakdown

### Foundation (main session, before agents) — 13:30–13:50
- Install `@aws-sdk/client-s3`, `@aws-sdk/s3-presigned-post`, `@aws-sdk/s3-request-presigner` and `vitest` (dev). Add the `test` and `test:vault` scripts. **Agents must not edit `package.json` or the lockfile.**
- Schema change + migration SQL (generated with `prisma migrate diff`).
- `lib/vault/contracts.ts` (types, limits, allowlists, error codes) and `lib/storage/types.ts` (interface).
- Export `appendAudit` from `lib/approvals.ts` (one-word change to a shared file).
- `vitest.config.ts`.

### Parallel agents (Opus, low effort, own worktrees) — 13:50–15:00

| Agent | Owns | Delivers |
|---|---|---|
| **A · Storage** | `lib/storage/**`, `compose.yaml` (minio-init + S3 env), `.env.example` (S3 vars), `tests/vault/storage/**` | S3 adapter, in-memory adapter, key generator, ensureBucket, presigned POST/GET, unit tests |
| **B · API** | `lib/vault/server/**`, `app/api/organizations/[organizationId]/documents/**`, `tests/vault/api/**` | Service layer + 5 routes, validation, authz matrix, audit events, rate limit, unit tests with in-memory storage + mocked db |
| **C · Client/UI** | `lib/vault/client/**`, `app/dashboard/vault/**`, `tests/vault/client/**` | VaultCipher (Tide + Demo), upload/decrypt UI, diagnostics page, unit tests |
| **D · Security tests** | `tests/vault/integration/**`, `tests/vault/helpers/**`, `scripts/vault/**` | Negative integration tests against the contract (IDOR, cross-tenant, AUDITOR, size, MIME, integrity, expiry, demo format in tidecloak mode, objectKey not exposed), leak-scan script |

### Tide realm track (main session + user, in parallel with agents)
1. Docker Desktop running → `docker run` tidecloak-dev on `:8080` with the ignored `tidecloak-data/` volume.
2. Run the vendor realm init. **The user** completes licence activation and first-admin enrollment in the browser.
3. Create realm roles `_tide_vault.selfencrypt` and `_tide_vault.selfdecrypt`. **The user** registers test users `alice` and `bob` (both roles) and `mallory` (no vault roles), and approves the QEA change requests.
4. Generate `.env.local` (ignored).

### Integration (main session) — 15:00–15:40
- Merge `origin/main`, then branches A → B → C → D. Run `npx prisma generate`, `npm run build`, `docker compose config --quiet`, `docker compose up --build -d`, `npm run test:vault`.
- Live check with `npm run dev` in tidecloak mode: alice uploads a canary file and decrypts it, bob tries to decrypt, mallory tries to encrypt. Then run `leak-scan`.
- Record the results in `docs/vault/TIDE_E2EE_VERIFICATION.md`.

### Docs & handoff — 15:40–16:00
- Update the README vault section and the SKILL.md status and task log, add the feature status matrix, and commit. Push or open a PR only on the user's OK.

## 11. Acceptance criteria → evidence

| Criterion | Evidence |
|---|---|
| Unauthorized users cannot get metadata/ciphertext | D: non-member, cross-tenant, suspended and AUDITOR tests; B: authz unit tests |
| Plaintext absent from PG, storage, URLs, logs, errors, analytics | Client-only encryption; leak-scan on live canary upload; D: error bodies don't echo input; no analytics |
| Authorized users decrypt only in browser | C: Tide cipher in browser; server has no decrypt code path (grep check) |
| Object keys unpredictable | A: 256-bit random keys, uniqueness/entropy test, key not exposed by API |
| Org-scoped routes | All routes under `/organizations/:id`; every query scoped by `organizationId` |
| Size/content-type limits server-side | B + D: 413/415 at init; presigned policy; commit re-verifies |
| E2EE roles/tags tested against real Tide realm | `TIDE_E2EE_VERIFICATION.md` with alice/bob/mallory matrix |
| Large-file handling deferred | 5 MiB cap; README states envelope encryption is deferred pending key-wrapping review |

## 12. Risks

- **Tide realm setup time** is the largest schedule risk. If it isn't working by 15:15, ship with Demo cipher in dev mode, mark the Tide E2EE criterion NOT VERIFIED, and keep the Tide cipher code path.
- `selfdecrypt` may be uploader-bound. That is accepted under the decision above.
- Large payload latency through Tide is unknown. The cap can be lowered after the realm test.
- MinIO CORS for direct browser POST. Fallback: a server-side ciphertext proxy route, which still only sees ciphertext.
- The audit table is not tamper-proof, as already documented by the spec.

## 13. Out of scope

Document deletion (a protected quorum operation per spec), versioning UI, large-file envelope encryption, shared org decrypt via Forseti, pending-upload garbage collection, thumbnails/previews.
