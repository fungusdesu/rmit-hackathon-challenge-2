# BusinessVault — MVP Status

Updated 2026-10-22 16:27 (UTC+7) on branch `feat/mvp-complete`. Scope: the spec's **Phase 1 vertical slice** (`BUSINESSVAULT_CODEX_SPEC.md` §11) and **definition of done** (§17).

## Overall: ~90% of the MVP is working

| Measure | Score | Notes |
|---|---|---|
| §17 definition of done (12 items) | **11 / 12 ≈ 92%** | Only "authorized encrypted round trip with Tide" is partial |
| §11 Phase 1 deliverables (9 items) | **8.5 / 9 ≈ 94%** | Tide client-side decrypt prototype is built but not run live |
| §12 screens (10) | **10 / 10 built** | The 6 newest screens are verified by HTTP + render checks, not yet by click-through browser tests |
| Verification depth | **~88%** | Playwright now covers every module (18/18); live Tide E2EE is still missing |

**Honest single number: ~90% functional MVP.** The remaining ~10% is verification against live Tide (blocked by Tide-network errors today) and broader browser testing, not missing features.

## Feature matrix

| Module | API | UI | Tests | Status |
|---|---|---|---|---|
| Landing + auth (Tide login/logout, session) | ✅ | ✅ | Tide token verification tests | ✅ |
| Organizations + onboarding | ✅ | ✅ (create org on Overview) | ✅ | ✅ |
| Overview (metrics, attention list, activity, real user chip) | ✅ | ✅ | render check | ✅ |
| Requests / quorum workflow (4 operations, digest, expiry, idempotency, exactly-once execute) | ✅ | ✅ My requests + new-request form | ✅ unit + HTTP flow | ✅ APP-LEVEL ONLY |
| Approvals inbox + request detail (exact payload, quorum progress, approve/reject/execute/cancel) | ✅ | ✅ | ✅ 10 unit + HTTP flow | ✅ APP-LEVEL ONLY |
| Members & owners + invitations (privileged changes via quorum) | ✅ | ✅ | ✅ unit + HTTP flow | ✅ |
| Encrypted document vault (ciphertext-only, presigned storage, integrity, leak scan) | ✅ | ✅ | ✅ 166 + 7 Playwright | ✅ demo cipher · 🟡 Tide live |
| Asset registry (inventory, criticality, review dates, critical-delete protection) | ✅ | ✅ | ✅ 12 incl. DB | ✅ inventory only |
| Audit log (list, filters, hash-chain verify incl. tamper/fork detection, JSON/CSV export) | ✅ | ✅ | ✅ 8 incl. DB tamper test | ✅ no external anchor |
| Security settings (governed policy changes, system health) | ✅ | ✅ | ✅ 10 incl. DB/MinIO | ✅ |
| Cross-platform (Windows + Linux Compose, doctor, runbook) | — | — | ✅ compose configs validate; Linux container tests | ✅ |

## Verification evidence (16:20–16:27)

- **Windows:** `tsc` clean; **215 tests pass** (`VAULT_IT=1`: unit + Postgres + MinIO + HTTP security); `npm run build` passes (19 pages); all 8 dashboard pages render; `/api/system/health` reports DB, storage and Tide config OK.
- **Linux (Docker, Alpine, Node 22):** the earlier vault suites passed (the one failure was a hard-coded endpoint, since fixed). See `docs/HANDOFF.md` for the final run.
- **Tide realm `bv9`:** licensed, vault roles provisioned, admin enrolled, IdP signed; Tide-mode auth boundary 3/3.

## What's left (the ~10%)

1. **Live Tide E2EE round trip.** Log in as the enrolled admin, then run `/dashboard/vault/diagnostics`. Blocked today by Tide-network signing errors and time (`docs/vault/TIDE_E2EE_VERIFICATION.md`).
2. ~~Browser Playwright coverage for all modules~~: **done** (18/18; `E2E_BASE_URL=http://localhost:3000 npx playwright test`). Deep click-through flows (approve via the UI, invite via the UI) are still manual.
3. **Cryptographic enforcement of approvals (Forseti).** This is Phase 2 in the spec, explicitly not an MVP item. Approvals are labelled APP-LEVEL APPROVAL ONLY.
4. **Hardening before any non-local deployment:**
   - Set `MINIO_CORS_ALLOW_ORIGIN` to the real app origin. Locally it is already restricted to `localhost:3000,3200` (fixed 16:35).
   - Use a shared rate-limit store instead of in-memory.
   - Anchor the audit chain externally.

## Known limitations (do not overclaim)

- Approvals are enforced by the app database only, not cryptographically.
- Decryption is uploader-only (Tide self-decrypt); shared org decryption needs Forseti policies.
- Asset registry is inventory only: BusinessVault does not control provider admin rights.
- A DB superuser can rewrite the audit chain (no external anchor).
- Decrypted files can be copied from an authorized device; revocation can't erase them.
