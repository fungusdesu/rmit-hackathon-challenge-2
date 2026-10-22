# Vault Feature Status

Updated 2026-10-22. Status values: **VERIFIED** (automated test or live run), **PARTIAL**,
**NOT VERIFIED** (code exists, not proven against the real dependency), **DEFERRED**.

## Acceptance criteria (from the vault handoff)

| Criterion | Status | Evidence |
|---|---|---|
| Unauthorized users cannot retrieve document metadata or ciphertext | VERIFIED | `tests/vault/integration/tenant-isolation.test.ts`, `authorization.test.ts`, `tests/vault/api/documents.test.ts`. Non-member, cross-tenant, SUSPENDED/REMOVED/INVITED → identical `404 {"error":"not_found"}`; AUDITOR and MEMBER-on-others → 403 |
| Plaintext absent from PostgreSQL, object storage, URLs, logs, errors, analytics | VERIFIED for the demo cipher path | `leakage.test.ts` (canary in content and filename absent from Document rows, AuditEvents, MinIO objects, API responses); live browser upload of a canary file, then `scripts/vault/leak-scan.ts` PASS on `pg_dump` and every bucket object; dev-server log checked for the canary. No analytics SDK exists. Error bodies are fixed `{error}` codes |
| Authorized users decrypt only in the browser | VERIFIED (demo cipher) / NOT VERIFIED (Tide) | The server has no decrypt code path. The live browser round trip (encrypt, upload, decrypt name, decrypt & save) returned the exact plaintext. The Tide cipher is covered by unit tests with a fake SDK only |
| Object keys are unpredictable | VERIFIED | `v1/` + 256-bit random base64url; `tests/vault/storage/keys.test.ts` (10k uniqueness), `object-keys.test.ts` (no org/user ids); `objectKey` is never returned by the API |
| Upload/download routes are organization-scoped | VERIFIED | All routes live under `/api/organizations/:organizationId/documents`; every query is scoped by `organizationId` plus ACTIVE membership |
| File size and content-type limits enforced server-side | VERIFIED | `limits.test.ts`: 413 / 415 / 400 at upload-init; presigned POST `content-length-range` rejects oversize bodies (`s3.integration.test.ts`); commit re-checks size and SHA-256 → 422 and the object is deleted |
| E2EE roles and tag behaviour tested against the real Tide realm | **PARTIAL** | Realm `bv9` provisioned with the vault roles/tag, admin enrolled, Tide-mode auth boundary verified (3/3). A live encrypt/decrypt round trip and cross-user/no-role tests were blocked by Tide network signing errors and time. See `TIDE_E2EE_VERIFICATION.md` |
| Large-file handling deferred unless key wrapping is reviewed | DEFERRED (as required) | 5 MiB default cap, 10 MiB hard cap; no envelope encryption |

## Components

| Component | Status | Notes |
|---|---|---|
| Document schema (additive migration `20261022063000_vault_document_upload`) | VERIFIED | Applied to local Postgres; only nullable/defaulted columns, one enum, one index |
| MinIO/S3 adapter (`lib/storage`) | VERIFIED | 9/9 storage tests including live MinIO; internal vs public endpoint signing; errors never include keys or URLs |
| Documents API (`lib/vault/server`, 5 routes) | VERIFIED | 34/34 service tests against Postgres; 47/47 HTTP security tests against the running app |
| Browser client and vault UI | VERIFIED (demo) | 11 unit tests; live browser flow in development mode |
| Tide cipher (`tide-e2ee-v1`) | NOT VERIFIED | Built on verified SDK types (`doEncrypt`/`doDecrypt`); needs a live realm |
| Diagnostics panel (`/dashboard/vault/diagnostics`) | NOT VERIFIED | Round-trips string, 1 MiB and 5 MiB, reports output types, and has a cross-user ciphertext paste test |
| Demo cipher fail-closed | VERIFIED | Server rejects `demo-not-e2ee-v1` unless `AUTH_MODE=development` (`validation.test.ts`); the client refuses to create it outside development |
| Rate limiting | PARTIAL | In-memory, per process; not shared across instances |
| Shared org decryption | BLOCKED | Requires Forseti policy-protected encryption |
| Document deletion / versioning UI | DEFERRED | Deletion is a protected quorum operation per spec |
| Pending-upload garbage collection | DEFERRED | Expired PENDING rows and orphaned objects are not swept yet |

## Security limits (read before demoing)

- The demo cipher is **not** E2EE. Its key lives in the browser's IndexedDB, and the banner says so.
- Plaintext already decrypted on an authorized device can be copied, and revoking access does not erase it.
- Metadata stays visible to the server and to storage operators: declared MIME type, ciphertext size, classification, uploader, timestamps.
- The server cannot verify the plaintext content type; the allowlist applies to the *declared* type.
- The audit trail is an ordinary table and is editable by a database superuser.
- No claim of protection against a compromised server until the Tide path is verified in this deployment.
- The Next.js dev server logs request paths, so document data must never go in URLs (the client never does).
- Invitations now go through the governance workflow (merged from `main`). Privileged invites need quorum approval, so a quick AUDITOR demo may still use the presenter-scoped database insert in `DEMO.md`.
- MinIO CORS is restricted to `http://localhost:3000,http://localhost:3200` via `MINIO_API_CORS_ALLOW_ORIGIN` (override with `MINIO_CORS_ALLOW_ORIGIN`). Verified: a foreign origin receives no allow header. (It had answered `*` until 16:35 because the setting was lost in a compose rewrite.)
- Browser E2E (Playwright, development mode): 7/7 pass (`tests/e2e/vault.spec.ts`, `docs/vault/E2E_FINDINGS.md`).
- `createTideCloakProxy` (`@tidecloak/nextjs@0.14.40`) authenticates `/api/organizations/*` from the `kcToken` cookie only. Browsers work because the SDK sets that cookie. Bearer-only clients (curl, scripts) get 401 from the proxy and must send the cookie.
- Security review findings and their status are tracked in `SECURITY_REVIEW.md`; the threat model is in `THREAT_MODEL.md`.
