# BusinessVault — Handoff & Resume Guide

Written 2026-10-22 16:16 (local, UTC+7) in case the working session runs out. Target: a functional MVP **pushed to `main` by 17:00**.

If you're picking this up, read §1 to see where things stand, then follow §4.

---

## 1. Where things stand

| Branch | Where | State |
|---|---|---|
| `main` (origin) | GitHub | `9df290c`. Already contains the vault (merged from `feat/vault` @ `1c30222`), plus the frontend and governance work |
| `feat/vault` (origin) | GitHub | `003fbd7`. Adds 2 small commits on top of what `main` has: the Tide verification results doc and a storage-test fix for Linux/Compose |
| `feat/mvp-complete` (local, pushed if this file is on GitHub) | `D:\rmit-hackathon-challenge-2` | Integration branch = `origin/main` + `feat/vault`. Agent branches get merged **here**, then this goes to `main` |

### Parallel agent branches (local only, in `.claude/worktrees/`)

All of them branch from `feat/mvp-complete` @ `ecd5181`.

| Module | Branch | Owns (files) | Status at 16:16 |
|---|---|---|---|
| Approvals inbox + My requests | `worktree-agent-aaa59283565e7f54a` | `app/dashboard/approvals/**`, `app/dashboard/requests/**`, `tests/ui/approvals/**` | running |
| Members & invitations | `worktree-agent-ac1ebf27541bdfcf6` | `app/dashboard/members/**`, `tests/ui/members/**` | running |
| Asset registry (API + UI + migration) | `worktree-agent-af6f51546203a61e0` | `prisma/schema.prisma` (Asset only), `prisma/migrations/20261022160000_asset_registry_fields/**`, `lib/assets/**`, `app/api/organizations/[organizationId]/assets/**`, `app/dashboard/assets/**`, `tests/assets/**` | running |
| Audit log + chain verify + export | `worktree-agent-a66ac3ff801a85483` | `lib/audit-verify.ts`, `app/api/organizations/[organizationId]/audit/verify|export/**`, `app/dashboard/audit/**`, `tests/audit/**` | **done** (`3674bd4`). tsc, unit tests and build pass; DB test not yet run (Docker was down) |
| Settings, policies, system health | `worktree-agent-aa6991e4e82c1f421` | `app/dashboard/settings/**`, `app/api/system/health/**`, `lib/system-health.ts`, `tests/settings/**` | running |
| Overview, shell, Windows + Linux runbook | `worktree-agent-ad0ce5db5f492ad0e` | `app/dashboard/page.tsx`, `layout.tsx`, `use-workspace.ts`, `feature-preview.tsx`, `[feature]/page.tsx`, `compose.yaml`, `compose.linux-host.yaml`, `.env.example`, `README.md`, `scripts/dev/**`, `docs/RUNBOOK.md`, `package.json` (scripts only), `tests/dev/**` | running |

Files never overlap between agents, so merges should be conflict-free. The exceptions are `package.json` (only the overview/runbook agent touches its scripts) and `README.md`.

---

## 2. Local environment (this PC)

| Thing | Value |
|---|---|
| Postgres | `localhost:5432`, `businessvault` / `businessvault`, db `businessvault` (Compose service `postgres`) |
| MinIO | API `localhost:9000`, console `localhost:9001`, `businessvault` / `businessvault-secret`, bucket `businessvault` |
| TideCloak | Container `bv-tidecloak`, `localhost:8080`, master admin `admin` / `password` (dev only). **No volume**: deleting the container loses the realms |
| Tide realm | `bv9` (licensed; vault roles; admin enrolled as the presenter's Tide account; IdP signed). Adapter in ignored `tidecloak-setup/tidecloak.json` and `.env.local` |
| App modes | Dev auth: Claude launch config `vault-dev-auth` (env overrides `.env.local`). Tide mode: `npm run dev` (reads `.env.local`) |
| Ignored local files | `.env.local`, `env`, `env.download`, `tidecloak-setup/`, `NEXT_STEPS.md`, `GEMINI_PROMPT.md` (never commit them) |

If Docker Desktop dies (it did at 16:10 under memory pressure), recover with:

```powershell
docker desktop restart
docker start bv-tidecloak
docker compose up -d postgres minio
```

---

## 3. Verification commands

### Windows (PowerShell)

```powershell
npm ci; npx prisma generate
$env:DATABASE_URL="postgresql://businessvault:businessvault@localhost:5432/businessvault"; npx prisma migrate deploy
npx tsc --noEmit
npx vitest run
$env:VAULT_IT="1"; npx vitest run      # needs Postgres + MinIO; HTTP suites also need the app on :3000 in dev-auth mode
npm run build
```

### Linux (bash, or inside Docker)

```bash
npm ci && npx prisma generate
DATABASE_URL=postgresql://businessvault:businessvault@localhost:5432/businessvault npx prisma migrate deploy
npx tsc --noEmit && npx vitest run && npm run build
VAULT_IT=1 npx vitest run
```

Linux-in-Docker check that was used (from the repo root on Windows works too):

```bash
docker compose build migrate
docker compose run --rm --no-deps -e VAULT_IT=1 -e S3_ENDPOINT=http://minio:9000 -e S3_PUBLIC_ENDPOINT=http://minio:9000 -e S3_BUCKET=businessvault -e S3_ACCESS_KEY_ID=businessvault -e S3_SECRET_ACCESS_KEY=businessvault-secret -e S3_REGION=us-east-1 migrate sh -c "npx vitest run tests/vault/api tests/vault/storage tests/vault/client"
```

Last result: **112/116 pass on Linux**. The 4 failures were a hard-coded `localhost:9000` in one test, fixed in `003fbd7`. The rerun was interrupted by the Docker crash.

---

## 4. How to finish (integrate → verify → push to main)

```bash
git switch feat/mvp-complete
git fetch origin && git merge origin/main          # pick up anything teammates pushed
for b in worktree-agent-aaa59283565e7f54a worktree-agent-ac1ebf27541bdfcf6 \
         worktree-agent-af6f51546203a61e0 worktree-agent-a66ac3ff801a85483 \
         worktree-agent-aa6991e4e82c1f421 worktree-agent-ad0ce5db5f492ad0e; do
  git merge --no-edit "$b" || break               # stop on the first conflict and resolve it
done
git checkout -- public/silent-check-sso.html next-env.d.ts   # tooling rewrites these; never commit them
```

Then:
1. Run §3 on Windows: `prisma migrate deploy` applies the asset migration; then typecheck, tests and build.
2. Restart the dev server after merging. It caches the storage client across hot reloads, so a stale server gives 500s on commit.
3. Smoke-test pages in dev-auth mode:
   - `/dashboard`, `/dashboard/approvals`, `/dashboard/requests`, `/dashboard/members`
   - `/dashboard/vault`, `/dashboard/assets`, `/dashboard/audit`, `/dashboard/settings`
4. Run the Linux-in-Docker check.
5. Push:
   - `git push origin feat/mvp-complete`
   - if `main` hasn't moved: `git push origin feat/mvp-complete:main` (fast-forward)
   - if `main` has moved: merge `origin/main` again, re-run the tests, then push.

**Rule:** leave out any agent branch that breaks the build or tests, rather than pushing a broken `main`. Say so in the PR or commit message.

---

## 5. Known issues and constraints (carry into the final report)

- **Tide E2EE:** realm `bv9` provisioned, Tide-mode auth verified (3/3), but a live encrypt/decrypt round trip was never run. bob's enrollment failed on Tide's network (`IDENTITY_ATTESTATION_SIGN_FAILED`). See `docs/vault/TIDE_E2EE_VERIFICATION.md`.
- **Approvals are APP-LEVEL ONLY.** They are not cryptographically enforced by Tide/Forseti.
- **The audit hash chain can be rewritten by a DB superuser** (no external anchor).
  - The audit agent also found that `scripts/vault/sweep-pending.ts` writes audit rows with the legacy (v1, non-canonical) hash and without the org row lock.
  - Its rows may show as `legacyUnverifiable` or as forks in chain verification. Fix it by making the script reuse `lib/audit.ts`'s `appendAudit` logic.
- **Default `compose.yaml` app service used Linux-only `network_mode: host`.** The runbook agent is moving that into `compose.linux-host.yaml`, so the default works on Docker Desktop (Windows/macOS) too.
- **MinIO CORS answers `*`.** Restrict it before any non-local deployment.
- **Rate limits and the download-anomaly alert are in-memory** (single instance).
- **The Tide proxy authenticates from the `kcToken` cookie only.**

## 6. Where the docs are

- Vault: `docs/vault/` (`PLAN.md`, `STATUS.md`, `SECURITY_REVIEW.md`, `THREAT_MODEL.md`, `TIDE_E2EE_VERIFICATION.md`, `DEMO.md`, `SHARED_DECRYPT.md`, `LARGE_FILES_DESIGN.md`, `E2E_FINDINGS.md`)
- Project: `README.md`, `SKILL.md` (task log), `docs/ARCHITECTURE.md`, `docs/SECURITY_MODEL.md`, `docs/TIDECLOAK_SETUP.md`, `docs/RUNBOOK.md` (once the runbook agent's branch is merged)
