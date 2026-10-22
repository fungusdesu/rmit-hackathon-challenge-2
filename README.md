[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked)

## Project overview

*BusinessVault* helps co-owned businesses govern privileged changes, manage digital assets, and store encrypted documents through a shared workspace.

Built with [TideCloak](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked).

### 1. Vision & originality

We propose a company workspace where requesting, authorizing, and executing a sensitive change are separate steps. Shared ownership becomes an explicit approval policy, with the exact action visible before anyone approves.

### 2. Trust constraint insight

Shared businesses often depend on one administrator who can remove colleagues or expose company data. BusinessVault aims to reduce that dependence through owner quorums and browser encryption, enabling collaboration without granting one person unchecked authority.

### 3. Value & impact

Startups, agencies, and teams with shared assets gain clearer accountability and safer handovers. Once governance is active, inviting a new administrator requires other owners’ approval, while auditors can review the decision and its execution.

### 4. Why TideCloak matters

TideCloak supplies verified identity and browser encryption APIs, supporting our goal of tying access to people while keeping document plaintext on their devices. Identity and encryption adapters are implemented; live Tide encryption remains unverified. The local vault is labelled *DEMO — NOT E2EE*; governance is *APP-LEVEL APPROVAL ONLY*, with Tide/Forseti enforcement planned.

### 5. Prototype & storytelling

Follow Bob’s administrator-invitation request: self-approval is blocked, Alice and Carol review the exact payload, and execution becomes available after both approve. Then inspect the audit trail, upload and decrypt a demo document, and switch to an outsider to demonstrate organization isolation.

## Setup

### Requirements

- Node.js 22 and npm.
- Docker Engine or Docker Desktop with Docker Compose v2.
- Available local ports: 3000 (app), 5432 (PostgreSQL), 9000 (MinIO API), and 9001 (MinIO console). Live Tide mode also needs an accessible TideCloak server, typically on 8080.

The application uses Next.js 16, React 19, TypeScript, Prisma, PostgreSQL 17, MinIO, and the TideCloak SDK.

### Run the local prototype

The local walkthrough uses explicit development identities and a demo vault cipher. It runs without Tide enrollment. Use it only on a local development machine.

1. Install dependencies and create an environment file on a fresh checkout:

   
   npm ci
   cp .env.example .env
   

   On PowerShell, use Copy-Item .env.example .env for the copy step. If you already have .env, edit that file rather than replacing it.

2. Set these values in .env, keeping the example’s other storage settings:

   
dotenv
   DATABASE_URL=postgresql://businessvault:businessvault@localhost:5432/businessvault
   APP_ORIGIN=http://localhost:3000
   AUTH_MODE=development
   NEXT_PUBLIC_AUTH_MODE=development
   ALLOW_INSECURE_DEV_AUTH=true
   DEV_AUTH_SUBJECT=local-owner
   DEV_AUTH_NAME=Local Owner
   DEV_AUTH_EMAIL=owner@localhost.test
   

   Next.js gives an existing .env.local precedence over .env. Keep overlapping settings consistent, particularly the authentication mode. Compose and the Prisma CLI use .env; Compose does not automatically load .env.local.

3. Start the database and storage, apply migrations, and start the app:

   If a Docker-hosted app already occupies port 3000, run docker compose stop app first.

   
   docker compose up -d postgres minio minio-init
   npx prisma generate
   npx prisma migrate deploy
   npm run dev
   

4. In a second terminal, seed the demo workspace:

   
   npm run seed:demo
   

   Open [the dashboard](http://localhost:3000/dashboard). Select *Alice (owner)* in *DEV · acting as*, then choose *Northstar Labs (demo)*. The seed creates three owners, a member, an auditor, three asset records, and Bob’s pending administrator-invitation request. Switch to Bob, Alice, and Carol to follow the approval story; Erin is the auditor and Mallory is the outsider. Re-running the seed reuses an existing active demo organization.

| Service | Local address |
| --- | --- |
| Application | http://localhost:3000 |
| Dashboard | http://localhost:3000/dashboard |
| MinIO console | http://localhost:9001 |
| PostgreSQL | localhost:5432 |

MinIO’s local console credentials are businessvault / businessvault-secret. All Compose credentials and development identities are for local use only.

To run the application in Docker instead, stop the host development server and run:

docker compose up --build

Compose runs migrations and initializes the private storage bucket before starting the app. Stop the stack with docker compose down; adding -v deletes the Compose-managed database and storage volumes. On Windows-mounted filesystems with PostgreSQL permission errors, set POSTGRES_DATA_DIR in .env to a directory on a Linux filesystem before starting PostgreSQL.

### Enable live TideCloak

TideCloak runs separately from the services in compose.yaml. Follow the [TideCloak setup guide](docs/TIDECLOAK_SETUP.md) and [vendor quickstart](https://docs.tide.org/Admin/Quick-deploy-test) to provision a realm, activate its license, and complete Tide account enrollment.

1. Register a client with valid redirects http://localhost:3000/auth/redirect and http://localhost:3000/silent-check-sso.html, and web origin http://localhost:3000. Approve and commit realm changes when required by QEA.
2. Set AUTH_MODE=tidecloak, NEXT_PUBLIC_AUTH_MODE=tidecloak, and ALLOW_INSECURE_DEV_AUTH=false. Set both the TIDECLOAK_* and NEXT_PUBLIC_TIDECLOAK_* server URL, realm, and client ID values to match your actual realm. Set NEXT_PUBLIC_TIDECLOAK_REDIRECT_URI=http://localhost:3000/auth/redirect.
3. Download the client’s full Tide adapter and set TIDECLOAK_ADAPTER_JSON and NEXT_PUBLIC_TIDECLOAK_ADAPTER_JSON in your ignored environment file. For vault testing, provision _tide_vault.selfencrypt and _tide_vault.selfdecrypt. Keep local credentials, adapter files, and realm data out of source control.
4. For a local http://localhost:8080 issuer, run the app on the host with npm run dev so the browser and app server can both reach it. Stop a Docker-hosted app first with docker compose stop app. Linux users can alternatively use the host-network override described in the [runbook](docs/RUNBOOK.md).
5. Start a fresh sign-in at http://localhost:3000/auth/login, then check http://localhost:3000/api/auth/session. The vault test panel is at /dashboard/vault/diagnostics.

NEXT_PUBLIC_* settings are embedded at build time; rebuild a Docker or production app after changing them. A connection refusal on localhost:8080 means the identity server is unavailable. Copying environment values or adapter JSON does not restore a realm’s database, keys, or enrolled users.

### Verification and limitations

Run these commands from the repository root:

| Command | Purpose |
| --- | --- |
| node --env-file=.env scripts/dev/doctor.mjs | Check the local environment and service connectivity |
| npm run build | Compile the production application and check TypeScript |
| npm run test:all | Run Vitest suites; integration cases require their opt-in flags |
| npm run test:tide | Test token signature, issuer, client, expiry, and malformed-token rejection |
| npm run test:it | Enable database, storage, and HTTP integration suites; requires local services and a development-auth app on port 3000 |
| npm run test:e2e | Run Playwright browser tests; first install Chromium with npx playwright install chromium |

Use a disposable local database for tests. Browser tests use a development server on port 3200 by default; PostgreSQL, MinIO, and migrations must already be ready. See the [runbook](docs/RUNBOOK.md) for testing an existing server and running the governance HTTP suite.

- Approvals are enforced by the application. Independent Tide/Forseti authorization at the final executor remains future work.
- The demo vault uses a browser-local AES key and is labelled *DEMO — NOT E2EE*. The Tide encryption path requires a verified live round trip; shared organization decryption remains blocked. The default ciphertext limit is 5 MiB.
- The asset registry records ownership and review information; it does not control external provider permissions.
- Audit hash-chain verification has no independent external anchor and cannot prevent a database administrator from rewriting the chain.

Further reading: [MVP feature matrix](docs/MVP_STATUS.md), [demo walkthrough](docs/DEMO_FILMING.md), [vault verification](docs/vault/TIDE_E2EE_VERIFICATION.md), and [security model](docs/SECURITY_MODEL.md).