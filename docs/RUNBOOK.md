# BusinessVault runbook (Windows + Linux)

All commands run from the repository root. Windows commands are PowerShell; Linux commands are bash.

## 0. One-time setup

PowerShell:
```powershell
npm ci
npx prisma generate
Copy-Item .env.example .env.local
```

bash:
```bash
npm ci
npx prisma generate
cp .env.example .env.local
```

## 1. Doctor

Checks Node >= 20, Docker, ports 3000/5432/9000/8080, required env names (values are never printed), Postgres and MinIO reachability.

```
npm run doctor
```

Port 3000 / 8080 not listening is a WARN (app / TideCloak not started yet); missing Postgres / MinIO is a FAIL.

## 2. Dev mode (Compose services + `npm run dev` on the host)

Same commands on both OSes:
```
docker compose up -d postgres minio minio-init
npx prisma migrate deploy
npm run dev
```
`.env.local` must point at `localhost:5432` and `http://localhost:9000` and set `AUTH_MODE=development`, `NEXT_PUBLIC_AUTH_MODE=development`, `ALLOW_INSECURE_DEV_AUTH=true`, `DEV_AUTH_SUBJECT=local-owner`. Open http://localhost:3000/dashboard.

## 3. Full Docker mode (Windows, macOS, Linux)

```
docker compose up --build
```
The app is published on `3000:3000`; inside the network it uses `postgres:5432` and `http://minio:9000`, while presigned URLs given to the browser use `S3_PUBLIC_ENDPOINT=http://localhost:9000`. `migrate` and `minio-init` run once before the app starts.

Validate config without starting anything:
```
docker compose config --quiet
docker compose -f compose.yaml -f compose.linux-host.yaml config --quiet
```

## 4. Tide mode

The TideCloak issuer must be `http://localhost:8080` for both the browser and the server, so the app process must see TideCloak on `localhost`. See `docs/TIDECLOAK_SETUP.md` for realm/client setup.

Linux (host networking override):
```bash
docker compose -f compose.yaml -f compose.linux-host.yaml up --build
```

Windows / macOS (Docker Desktop has no host networking for this use): run services in Docker and the app on the host.
```powershell
docker compose up -d postgres minio minio-init
npx prisma migrate deploy
$env:AUTH_MODE = "tidecloak"; $env:NEXT_PUBLIC_AUTH_MODE = "tidecloak"
npm run dev
```
(Put the `TIDECLOAK_*` / `NEXT_PUBLIC_TIDECLOAK_*` values in `.env.local`.)

## 5. Tests

```
npm run test:all        # all vitest suites
npx vitest run tests/dev
npm run test:it         # integration tests: sets VAULT_IT=1 cross-platform (needs Postgres + MinIO)
npm run test:tide
npm run test:governance
npm run test:e2e        # Playwright
```
Do not use `VAULT_IT=1 npx vitest` syntax on PowerShell; `npm run test:it` works on both.

## 6. Leak scan

```
npm run vault:leak-scan
```

## Troubleshooting

- Port already in use: `npm run doctor` shows which. PowerShell: `Get-NetTCPConnection -LocalPort 5432`; bash: `ss -ltnp | grep 5432`.
- MinIO port open but health check fails: `docker compose restart minio minio-init`.
- Browser upload CORS errors: `minio-init` sets `cors_allow_origin` for `http://localhost:3000`; re-run it after changing ports.
