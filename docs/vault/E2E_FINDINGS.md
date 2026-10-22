# Vault Browser E2E Findings

## Summary
- **Suite**: `tests/e2e/vault.spec.ts` (Playwright Chromium, single worker, `retries: 0`, port `3200`, `AUTH_MODE=development`)
- **Result**: **7 passed, 0 failed, 0 fixme**
- **Covered scenarios**:
  1. Demo labelling (`DEMO — NOT END-TO-END ENCRYPTED` alert banner and uploader-only decrypt notice)
  2. Browser encryption & presigned MinIO upload round-trip as `Alice (dev)` (`dev-alice`)
  3. Network inspection verifying zero plaintext canary leakage in request URLs or POST bodies to `localhost:3200` and `localhost:9000`, and no `Authorization` header sent to `localhost:9000`
  4. In-browser filename decryption (`Decrypt name`) and file payload decryption + download (`Decrypt & save`) matching the original plaintext and filename
  5. Unauthorized user isolation when switching to `Bob (dev)` (`dev-bob`) in the UI and via `GET /api/organizations/:orgId/documents` (`404 {"error":"not_found"}`)
  6. Mobile viewport (`375×812`) layout check (`scrollWidth <= innerWidth + 1`) and screenshot capture to `tests/e2e/artifacts/vault-mobile.png`
  7. Diagnostics page (`/dashboard/vault/diagnostics`) graceful degradation outside `tidecloak` mode without runtime page errors

## Observations & Findings

### 1. MinIO CORS Allows `http://localhost:3200` (Returns `Access-Control-Allow-Origin: *`)
- **Context**: `compose.yaml` sets `MINIO_API_CORS_ALLOW_ORIGIN: http://localhost:3000` on the `bitnamilegacy/minio:2025.4.22` container.
- **Expected**: Browser `fetch()` requests (presigned `POST` upload and presigned `GET` ciphertext fetch) originating from `http://localhost:3200` might be blocked by CORS if MinIO strictly enforced `http://localhost:3000`.
- **Actual**: Both the presigned `POST` and presigned `GET` from origin `http://localhost:3200` succeeded in Chromium (`7/7` E2E tests pass without `test.fixme`). MinIO's S3 API responds with `Access-Control-Allow-Origin: *` by default unless configured via `mc admin config set local api cors_allow_origin=...` (or Bitnami's corresponding env variable).
- **File guess**: `compose.yaml` (`minio` / `minio-init` service configuration).
