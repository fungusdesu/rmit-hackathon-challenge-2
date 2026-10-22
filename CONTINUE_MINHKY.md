# Continue Here — for Minh Ky

Handoff from the 2026-10-22 hackathon session. `main` has everything. This file is all you need to pick up the work on your own machine.

**Status: ~92% of the Phase 1 MVP works.** Every module is built and tested. What's left is mostly **live Tide verification** plus Phase-2 hardening. Details are in [docs/MVP_STATUS.md](docs/MVP_STATUS.md).

---

## 1. Get running (≈10 minutes)

Requirements: Node ≥ 20 (Docker image uses 22), Docker with Compose, git.

### Linux / macOS (bash)

```bash
git checkout main && git pull
npm ci && npx prisma generate
docker compose up -d postgres minio minio-init
DATABASE_URL=postgresql://businessvault:businessvault@localhost:5432/businessvault npx prisma migrate deploy
AUTH_MODE=development NEXT_PUBLIC_AUTH_MODE=development ALLOW_INSECURE_DEV_AUTH=true DEV_AUTH_SUBJECT=local-owner \
DATABASE_URL=postgresql://businessvault:businessvault@localhost:5432/businessvault \
S3_ENDPOINT=http://localhost:9000 S3_PUBLIC_ENDPOINT=http://localhost:9000 S3_BUCKET=businessvault \
S3_ACCESS_KEY_ID=businessvault S3_SECRET_ACCESS_KEY=businessvault-secret S3_REGION=us-east-1 npm run dev
# second terminal:
npm run seed:demo        # clean "Northstar Labs (demo)" org: 3 owners (governance ACTIVE), member, auditor, assets, a pending request
npm run doctor           # checks node, docker, ports, env, Postgres, MinIO
```

### Windows (PowerShell)

```powershell
git checkout main; git pull
npm ci; npx prisma generate
docker compose up -d postgres minio minio-init
$env:DATABASE_URL="postgresql://businessvault:businessvault@localhost:5432/businessvault"; npx prisma migrate deploy
$env:AUTH_MODE="development"; $env:NEXT_PUBLIC_AUTH_MODE="development"; $env:ALLOW_INSECURE_DEV_AUTH="true"; $env:DEV_AUTH_SUBJECT="local-owner"
$env:S3_ENDPOINT="http://localhost:9000"; $env:S3_PUBLIC_ENDPOINT="http://localhost:9000"; $env:S3_BUCKET="businessvault"
$env:S3_ACCESS_KEY_ID="businessvault"; $env:S3_SECRET_ACCESS_KEY="businessvault-secret"; $env:S3_REGION="us-east-1"
npm run dev
# second terminal: npm run seed:demo
```

Open http://localhost:3000/dashboard. Use **"DEV · acting as"** (top-right, dev mode only) to switch between Alice/Bob/Carol (owners), Dave (member), Erin (auditor) and Mallory (outsider).

Full Docker instead of `npm run dev`: run `docker compose up --build`. That works on Docker Desktop. On Linux with live Tide, add `-f compose.yaml -f compose.linux-host.yaml` so the issuer stays `localhost:8080`. See [docs/RUNBOOK.md](docs/RUNBOOK.md).

### Tests

```bash
npx tsc --noEmit
npx vitest run                         # unit tests (DB suites auto-skip)
VAULT_IT=1 npx vitest run              # + Postgres/MinIO/HTTP security suites (app must run on :3000 in dev mode)
npx playwright install chromium        # once
E2E_BASE_URL=http://localhost:3000 npx playwright test   # 18 browser tests against your running app
npm run build
```

On Windows, use `$env:VAULT_IT="1"; npx vitest run`, or `npm run test:it`, which is cross-platform.

**Last results (Windows, 16:42):** 215 Vitest pass, 18/18 Playwright pass, build passes. On Linux, the vault suites passed in Docker earlier. A full Linux container run was **not completed**: it was blocked by a 5–7 GB build context, which is now fixed in `.dockerignore`. Please run it (§5, P0-3).

---

## 2. Where the code lives

| Module | API / service | UI | Tests |
|---|---|---|---|
| Auth (Tide + dev) | `lib/auth/*`, `proxy.ts`, `app/api/auth/session` | `app/auth/*` (new login page) | `tests/tide/*.mjs` |
| Orgs, members, invitations | `lib/organizations.ts`, `lib/invitations.ts`, `lib/membership-governance.ts`, `app/api/organizations/**`, `app/api/invitations/accept` | `app/dashboard/page.tsx`, `app/dashboard/members/` | `tests/ui/members` |
| Governed requests & approvals | `lib/approvals.ts`, `lib/governance-error.ts`, `.../requests/**`, `.../policies` | `app/dashboard/approvals/`, `app/dashboard/requests/` | `tests/ui/approvals` |
| Encrypted vault | `lib/vault/**`, `lib/storage/**`, `.../documents/**` | `app/dashboard/vault/` (+ `/diagnostics`) | `tests/vault/**`, `tests/e2e/vault.spec.ts` |
| Asset registry | `lib/assets/**`, `.../assets/**` | `app/dashboard/assets/` | `tests/assets` |
| Audit | `lib/audit.ts` (write), `lib/audit-verify.ts` (verify/export), `.../audit/**` | `app/dashboard/audit/` | `tests/audit` |
| Settings & health | `lib/system-health.ts`, `app/api/system/health` | `app/dashboard/settings/` | `tests/settings` |
| Shell / overview / dev tools | `app/dashboard/layout.tsx`, `use-workspace.ts`, `dev-user-switcher.tsx` | | `tests/e2e/pages.spec.ts`, `tests/dev` |
| Scripts | `scripts/dev/` (`doctor`, `run-it`, `seed-demo`), `scripts/vault/` (`leak-scan`, `sweep-pending`, `tide-env`) | | |

Schema: `prisma/schema.prisma`. Migrations, in order: `initial` → `vault_document_upload` → `governance_policies` → `asset_registry_fields`. **Additive only, and never run `prisma format`**: it reformats the whole file and causes merge conflicts.

Engineering rules (authn, org scoping, audit, no fake guarantees) are in [SKILL.md](SKILL.md). Read its "Security Skill" before changing APIs.

---

## 3. Live Tide (the main open item)

You already have a working realm (`nextjs-test`) on **your** TideCloak. The adapter `env` you shared only works with your TideCloak's database, so do this on your machine:

1. Put your Tide values in `.env.local`:
   - `AUTH_MODE=tidecloak`, `NEXT_PUBLIC_AUTH_MODE=tidecloak`;
   - `TIDECLOAK_*` and `NEXT_PUBLIC_TIDECLOAK_*`;
   - `TIDECLOAK_ADAPTER_JSON` and `NEXT_PUBLIC_TIDECLOAK_ADAPTER_JSON`, from your `tidecloak.json`.

   `node scripts/vault/tide-env.mjs <realm>` builds the file from `tidecloak-setup/tidecloak.json`.
2. In the TideCloak admin console:
   - Create realm roles `_tide_vault.selfencrypt` and `_tide_vault.selfdecrypt`.
   - Grant both to your test users, and leave one user with **no** roles.
   - Approve the change requests. Your realm is multi-admin, so every change is a change request.
   - Grant the roles **one per request**: a combined grant only committed the first role under IGA.
3. Run `npm run dev`, log in at `/auth/login`, open `/dashboard/vault/diagnostics`, run the round-trip tests and click **Copy results as Markdown**.
4. Paste the results into [docs/vault/TIDE_E2EE_VERIFICATION.md](docs/vault/TIDE_E2EE_VERIFICATION.md), test-matrix rows 1–7.
   - Row 3 (user B decrypts A's file) decides whether shared decryption needs Forseti; see [docs/vault/SHARED_DECRYPT.md](docs/vault/SHARED_DECRYPT.md).
5. Server-side Tide tests: run `VAULT_IT=1 VAULT_IT_TIDE=1 npx vitest run tests/vault/integration/tide-mode.test.ts`. Set `VAULT_TIDE_TOKEN` and `VAULT_TIDE_ORG_ID` to run the last case too.

What happened today (so you don't repeat it):
- Tide's network rejected realm licensing 8 times (`VENDOR-KEYGEN_FAILED`) and then failed bob's identity signing (`IDENTITY_ATTESTATION_SIGN_FAILED`).
- Enrollment links are `localhost:8080`, so open them on the machine running TideCloak, in one go: the default 5-minute action timeout causes `expired_code`.
- The Tide proxy only reads the `kcToken` cookie, not Bearer.

---

## 4. Demo

[docs/DEMO_FILMING.md](docs/DEMO_FILMING.md) has an 11-step, 5-minute script with what to click as each person and what to say, plus the honesty lines. [docs/vault/DEMO.md](docs/vault/DEMO.md) has the vault deep-dive and leak-scan proof.

---

## 5. Backlog (in priority order)

**P0 — finish verification**
1. Live Tide E2EE round trip and test matrix (§3).
2. Film the demo (§4).
3. Full Linux container test run, now that `.dockerignore` is fixed:
   ```bash
   docker compose build migrate
   docker compose run --rm --no-deps -e VAULT_IT=1 -e S3_ENDPOINT=http://minio:9000 -e S3_PUBLIC_ENDPOINT=http://minio:9000 \
     -e S3_BUCKET=businessvault -e S3_ACCESS_KEY_ID=businessvault -e S3_SECRET_ACCESS_KEY=businessvault-secret -e S3_REGION=us-east-1 \
     migrate sh -c "npx vitest run tests/vault/api tests/vault/storage tests/vault/client tests/assets tests/audit tests/settings tests/ui tests/dev"
   ```

**P1 — small, valuable**
4. `GET /policies` should also return `governanceActive` and the active-owner count (the settings page currently calls `/summary` for it).
5. Make `lib/approvals.ts` importable under Vitest (lazy-load the TideCloak middleware import) so request payloads can be contract-tested.
6. Critical-asset changes: downgrading a CRITICAL asset is blocked today, and deleting one returns 409. A proper `DELETE_CRITICAL_ASSET` governed request would complete it.
7. Click-through Playwright flows: approve via UI, invite via UI, propose policy via UI. The current browser tests are render + data-flow smoke tests.

**P2 — Phase 2 (spec §11)**
8. Cryptographic enforcement of approvals (Tide QEA/Forseti); today it's **APP-LEVEL APPROVAL ONLY**.
9. External anchoring of the audit hash chain (`externalAnchorRef` is unused).
10. Shared rate-limit store (rate limits and the download-anomaly alert are in-memory).
11. Large-file envelope encryption: the design needs review first ([docs/vault/LARGE_FILES_DESIGN.md](docs/vault/LARGE_FILES_DESIGN.md)).

---

## 6. Gotchas we hit

- **Next.js 16 allows only one `next dev` per folder.** For Playwright, point `E2E_BASE_URL` at the running server.
- **After changing `lib/storage/types.ts`, restart the dev server.** The storage client is cached on `globalThis` across hot reloads, and a stale one causes 500s on commit.
- **Windows: stop the dev server before `npx prisma generate`.** Otherwise you get an EPERM error from the DLL lock.
- **The `@tidecloak/nextjs` postinstall rewrites `public/silent-check-sso.html`.** Don't commit that change (`git checkout -- public/silent-check-sso.html`).
- **Docker memory.** Parallel builds plus a huge build context exhausted Docker Desktop twice today. If `docker ps` hangs: run `docker desktop restart`, then `docker start bv-tidecloak` (if used), then `docker compose up -d postgres minio`.
- **MinIO CORS** is restricted to `http://localhost:3000,http://localhost:3200`. Set `MINIO_CORS_ALLOW_ORIGIN` for other origins, then `docker compose up -d minio`.
- **Never commit** `.env.local`, `tidecloak-setup/`, or the `env` / `env.download` files. They are ignored or local-only.

## 7. Docs index

- [docs/MVP_STATUS.md](docs/MVP_STATUS.md): percentage, feature matrix, evidence
- [docs/RUNBOOK.md](docs/RUNBOOK.md): Windows + Linux run modes
- [docs/HANDOFF.md](docs/HANDOFF.md): how today's parallel work was integrated
- [docs/DEMO_FILMING.md](docs/DEMO_FILMING.md): demo script
- `docs/vault/`: vault plan, status, security review, threat model, Tide verification, shared decrypt, large files
- `docs/ARCHITECTURE.md`, `docs/SECURITY_MODEL.md`, `docs/TIDECLOAK_SETUP.md`: team docs
