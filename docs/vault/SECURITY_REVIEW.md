# Vault security review (Agent F)

Scope: `git diff 7fe24c7..feat/vault` for `lib/vault`, `lib/storage`, the document routes, `app/dashboard/vault`, `scripts/vault`, `tests/vault`, `prisma` and `compose.yaml`. Also reviewed: `lib/auth/server.ts`, `proxy.ts` and `lib/approvals.ts#appendAudit`. Reviewed at `feat/vault@ae04a78`.

Method: code reading plus live probes against `localhost:3000` (dev-auth) and MinIO `localhost:9000`, run with `VAULT_IT=1` integration tests.

## Findings

| ID | Sev | Location | Scenario | Status |
|---|---|---|---|---|
| F-01 | med | `lib/vault/server/documents.ts` `initUpload` / `commitUpload`; `lib/storage/s3.ts` `createUploadTarget` | The presigned POST policy (5 min TTL, fixed key, size range `1..ciphertextSize`) can still be used **after commit**. The uploader replays it and replaces the AVAILABLE object with other bytes. The server's commit-time hash check then no longer describes what is stored. The browser's hash check in `decryptDocument` catches the swap (`integrity_mismatch`), so the effect is integrity loss or denial of service for readers, not silent substitution. **Confirmed** by `tests/vault/integration/policy-reuse.test.ts` (probe passes: MinIO answers 204). | open (E) |
| F-02 | low | `documents.ts` `rejectDocument` | After an integrity reject, the object is deleted, but the policy can recreate it within its TTL. That leaves orphaned ciphertext that no row references. **Confirmed** by a probe. | open (E) |
| F-03 | low | `documents.ts` `commitUpload` | Commit is not rate-limited. Each call runs `getObjectBytes` and buffers up to the max size (default 5 MiB, hard 10 MiB) in memory, so parallel commits are a memory and bandwidth amplifier. | open (E) |
| F-04 | low | `documents.ts` `issueDownload` | The ciphertext format is not checked at download, so a `demo-not-e2ee-v1` row created earlier in dev mode is still served after switching to `AUTH_MODE=tidecloak`. Creation is fail-closed (`validation.ts`, and `tide-mode.test.ts` covers it). | accepted-limitation (fresh DB per mode) / suggest filter in E |
| F-05 | low | `lib/vault/server/*` | No sweeper exists. Expired `PENDING_UPLOAD` rows and their objects are never cleaned up. Commit correctly refuses after `uploadExpiresAt`, so this is a storage hygiene issue only. Because there is no sweep, there is no commit-vs-sweep race. | open (E) |
| F-06 | low | `rate-limit.ts` | The limiter is in-memory and per process, keyed by subject, and its `Map` is never pruned. In dev mode any caller can rotate `x-dev-user-subject` to bypass it. In tidecloak mode subjects are token-verified. | accepted-limitation (single instance, dev mode insecure by design) |
| F-07 | low | `lib/auth/server.ts:35-37` | The `kcToken` cookie takes precedence over the bearer token, and the vault POST routes have no CSRF token. A cross-site POST could trigger download issuance or commit under the victim's cookie, which adds audit noise. Responses can't be read cross-origin, and the presigned URL is only in the body. Mitigation depends on the cookie's SameSite setting (not verified). | open (foundation/E) |

### Checked, no defect found
- **IDOR / tenant leaks.** `findVisible` scopes by `{id, organizationId}`. Non-members get 404. Another user's PENDING doc gives 404. MEMBER download of others' docs gives 403. AUDITOR upload/download gives 403. Covered by `authorization.test.ts` and `tenant-isolation.test.ts`.
- **Double commit.** The conditional `updateMany ... status=PENDING_UPLOAD` returns 409 on the second commit. Reject and commit claim the row the same way.
- **Policy scope.** The key is fixed by the policy, `eq $Content-Type application/octet-stream`, and `content-length-range` is capped at the declared size. Commit rechecks size, content-type and SHA-256.
- **Presigned GET.** The TTL is 60 s, signed for one key, with `ResponseContentDisposition: attachment`, `no-store` and `octet-stream`.
- **Error and metadata leaks.** SDK errors are mapped to `storage_unavailable`, API responses carry `Cache-Control: no-store`, `objectKey` is never returned, and audit JSON holds only `{documentId,size,classification,ciphertextFormat}`. Covered by `leakage.test.ts`.
- **Client.** The SHA-256 is computed over ciphertext only. Names are rendered as React text (no XSS), `a.download` gets the decrypted name (the browser sanitises separators), object URLs are revoked after 1 s, and no tokens go to storage (`uploadCiphertext` and `fetchCiphertext` send no auth headers). The demo cipher throws outside development mode.

### Suggested fixes
- **F-01/F-02 (E + storage).** On commit, `CopyObject` the upload key to a fresh server-only final key, verify the hash of the copy, store the final key and delete the upload key. Any later replay then writes only to a dead key. A cheaper partial fix is to shorten `PRESIGNED_UPLOAD_TTL_SECONDS` to about 60 s. A `copyObject` method has to be added to `lib/storage/types.ts` (foundation-owned); I can implement it in `s3.ts`/`memory.ts` once the interface exists.
- **F-03.** Call `enforceRateLimit(principal, "commit")` in `commitUpload`.
- **F-04.** In tidecloak mode, have `issueDownload`/`listDocuments` refuse `demo-not-e2ee-v1`.
- **F-07.** Require `Content-Type: application/json` on the vault POST routes, which forces a CORS preflight, or check `Origin`.

## Hardening checklist (spec §10) as it applies to the vault

| Item | Result |
|---|---|
| Least privilege, server-side policy on every endpoint | PASS (matrix enforced in `documents.ts`, integration-tested) |
| JWT issuer/audience/alg/signature/exp verification | DEPENDS on `verifyTideCloakToken` (not independently tested here) |
| Not trusting React role checks | PASS |
| HTTPS / secure cookies / CSP / CSRF | FAIL/PARTIAL: local HTTP only, no CSP reviewed, no CSRF token (F-07) |
| Tokens not in localStorage | NOT REVIEWED (TideCloak SDK) |
| Rate limiting | PARTIAL: upload-init and download yes, commit no (F-03), in-memory only (F-06) |
| Transactions / unique indexes / idempotency | PASS (audit in tx, `objectKey @unique`, conditional state transitions) |
| Secrets outside source control | PASS for app; compose has demo MinIO creds (dev only) |
| Object-storage access limits / retention | PARTIAL: short-TTL presigned URLs, CORS limited to localhost:3000; no retention/sweeper (F-05); policy reuse (F-01) |
| Minimise metadata, no plaintext logs | PASS (see `THREAT_MODEL.md` inventory; leak-scan script) |
| Alerting on large downloads | NOT IMPLEMENTED (audit event exists, no alerting) |

## Negative tests (spec §13) as they apply to the vault

| Test | Result / evidence |
|---|---|
| Change `organizationId` in URL without membership | PASS: 404 (`tenant-isolation.test.ts`) |
| Other tenant's document id | PASS: 404 (`tenant-isolation.test.ts`) |
| Forged / unverified JWT | NOT TESTED here (dev-auth server). Relies on `verifyTideCloakToken` |
| Reuse expired / captured upload proof | PARTIAL: expired pending → commit refused; **policy replay post-commit succeeds (F-01)** |
| Same action twice does not execute twice | PASS: second commit 409 |
| Plaintext not in Postgres / MinIO / logs | PASS in tests with demo/random ciphertext (`leakage.test.ts`, `scripts/vault/leak-scan.ts`); real Tide E2EE run pending (`TIDE_E2EE_VERIFICATION.md`) |
| Compromised app server cannot decrypt | DEPENDS on Tide verification; not claimed |
