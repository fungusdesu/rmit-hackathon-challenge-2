# BusinessVault

BusinessVault is a security and governance layer for shared business assets.

Project documents: [status](docs/PROJECT_STATUS.md), [architecture](docs/ARCHITECTURE.md),
[implementation plan](docs/IMPLEMENTATION_PLAN.md), [TideCloak setup](docs/TIDECLOAK_SETUP.md),
and [security model](docs/SECURITY_MODEL.md).

## Run locally with Docker

Requirements: Docker Engine with the Compose plugin.

```bash
docker compose up --build
```

Open:

- Application: http://localhost:3000
- MinIO console: http://localhost:9001
- PostgreSQL: localhost:5432

The default local credentials are intentionally development-only and are defined in
`compose.yaml`. Never expose this Compose stack to the public Internet or reuse these
credentials outside local development.

If PostgreSQL exits with `could not change permissions ... Operation not permitted`,
check `docker info --format '{{.DockerRootDir}}'`. Docker volumes stored on a Windows
drive (for example, `/mnt/d/...`) may not support the Linux permissions PostgreSQL
requires. Use a directory on a Linux filesystem instead:

```bash
mkdir -p "$HOME/.local/share/businessvault/postgres"
printf '\nPOSTGRES_DATA_DIR=%s\n' "$HOME/.local/share/businessvault/postgres" >> .env
docker compose up --build -d
```

This starts a separate database and preserves the old Docker volume. If an existing
database contains data, migrate it before switching directories. With this override,
database files persist in `POSTGRES_DATA_DIR`, including after `docker compose down -v`.

## Database development

The Prisma schema is in `prisma/schema.prisma`. After the PostgreSQL service is running,
create a local migration with:

```bash
docker compose up -d postgres
npx prisma migrate dev --name initial
```

The dashboard uses live organization, summary, and request APIs. TideCloak's provider, login,
proxy, and token verification boundaries are in the codebase, but interactive browser login
and Tide-backed authorization for BusinessVault actions remain unverified.

Compose uses an explicit development authentication adapter so the organization API can
be exercised locally. This adapter is not a security boundary and must never be enabled
in production. It requires both `AUTH_MODE=development` and
`ALLOW_INSECURE_DEV_AUTH=true`. The default Compose startup also runs the checked-in
Prisma migrations.

Example local API request:

```bash
curl -X POST http://localhost:3000/api/organizations \
  -H 'content-type: application/json' \
  -d '{"name":"Northstar Labs","description":"Local development workspace"}'
```

The API is only available with `AUTH_MODE=development` in the local Compose profile.

## Governance workflow

Protected operations are `REMOVE_OWNER`, `INVITE_PRIVILEGED_MEMBER`,
`CHANGE_PRIVILEGED_MEMBERSHIP`, and `UPDATE_POLICY`. A request is bound to a canonical payload
digest and an idempotency key. Approvals are distinct, policy-scoped, and cannot be issued
by the requester. Once the configured quorum is reached, execution claims the request in a
transaction and prevents a second execution.

Current approval endpoints:

```text
POST /api/organizations/:organizationId/requests
GET  /api/organizations/:organizationId/requests
POST /api/organizations/:organizationId/requests/:requestId/approve
POST /api/organizations/:organizationId/requests/:requestId/reject
POST /api/organizations/:organizationId/requests/:requestId/cancel
POST /api/organizations/:organizationId/requests/:requestId/execute
```

These approvals are currently `APP-LEVEL APPROVAL ONLY`. They are not a cryptographic
guarantee against a compromised application server until a verified Tide authorization
proof is bound to the final executor.

New organizations start in `INITIALIZING`. The founder can invite owners directly until
three owners accept. Activation revokes unused setup owner invitations. After activation,
owner/admin invitations and changes to privileged memberships require a protected request.
Owner removal needs two approvals from owners other than the requester and target, so it
requires at least four active owners and must leave at least three.

Invitation endpoints:

```text
GET    /api/organizations/:organizationId/invitations
POST   /api/organizations/:organizationId/invitations
DELETE /api/organizations/:organizationId/invitations/:invitationId
POST   /api/invitations/accept
PATCH  /api/organizations/:organizationId/members/:memberId
GET    /api/organizations/:organizationId/policies
GET    /api/organizations/:organizationId/audit
```

Invitation creation returns an acceptance link once. Only the token hash is stored; the
recipient must sign in with a verified matching email. Ordinary `MEMBER`/`AUDITOR` changes
can be made by an active owner or admin using `PATCH /members/:memberId` with a `reason`
and a `role` and/or `status`. A removed membership cannot be reactivated directly.

Protected request payloads use the existing `POST /requests` envelope with an
`idempotencyKey`. Examples:

```json
{"operationType":"INVITE_PRIVILEGED_MEMBER","idempotencyKey":"unique-request-001","payload":{"email":"new-owner@example.test","role":"OWNER","reason":"Add a co-owner"}}
{"operationType":"CHANGE_PRIVILEGED_MEMBERSHIP","idempotencyKey":"unique-request-002","payload":{"memberId":"membership-id","status":"SUSPENDED","reason":"Access review"}}
{"operationType":"UPDATE_POLICY","idempotencyKey":"unique-request-003","payload":{"operationType":"INVITE_PRIVILEGED_MEMBER","requiredApprovals":2,"ttlSeconds":3600,"baseVersion":1,"reason":"Shorter approval window"}}
```

Policy updates always require two distinct owner approvals; the policy for `UPDATE_POLICY`
cannot itself be edited. Policy updates cancel unexecuted requests for the changed operation.
The audit API verifies links and hashes for new events, and reports legacy events whose
old hash format cannot be independently recomputed. The chain has no independent anchor.

For an isolated development database and a running development-auth app, run:

```bash
GOVERNANCE_TEST_BASE_URL=http://localhost:3000 npm run test:governance
```

The test requires `DATABASE_URL` and creates unique test organizations. Never run it against
a shared production database. Tide login and invalid-token tests still require a live realm.

## TideCloak integration

The repository now uses the verified `@tidecloak/nextjs@0.14.40` APIs for:

- `TideCloakProvider`
- `createTideCloakProxy`
- `verifyTideCloakToken`

The live integration is enabled only when the Tide variables are configured. For a local
Tide development server, follow the current vendor setup guide, complete realm enrollment,
activate the development license, enable QEA, and configure the BusinessVault client with:

```dotenv
AUTH_MODE=tidecloak
NEXT_PUBLIC_AUTH_MODE=tidecloak
TIDECLOAK_AUTH_SERVER_URL=http://localhost:8080
TIDECLOAK_REALM=nextjs-test
TIDECLOAK_CLIENT_ID=myclient
NEXT_PUBLIC_TIDECLOAK_AUTH_SERVER_URL=http://localhost:8080
NEXT_PUBLIC_TIDECLOAK_REALM=nextjs-test
NEXT_PUBLIC_TIDECLOAK_CLIENT_ID=myclient
NEXT_PUBLIC_TIDECLOAK_REDIRECT_URI=http://localhost:3000/auth/redirect
```

Because `NEXT_PUBLIC_*` values are embedded during the Next.js build, rebuild after changing
them:

```bash
docker compose build --no-cache
docker compose up
```

The application protects dashboard and organization API routes through the TideCloak
proxy and independently verifies the access token at the API boundary. No Tide realm or
credentials are stored in this repository. Forseti authorization and Tide E2EE document
encryption remain pending real realm capability testing.

On Linux, the app service uses host networking so the browser and server both use the
realm's signed issuer and vendor return host, `http://localhost:8080`. Do not replace it
with a Docker service hostname or another loopback alias after provisioning the realm.

The local realm initializer generated an ignored `.env.local` with the verified development
realm values. Start the app outside Docker for the first live login test so both the browser
and the server can reach TideCloak at `localhost:8080`:

```bash
npm run dev
```

Then open `http://localhost:3000/auth/login`. The generated `tidecloak-setup/` directory
and `tidecloak-data/` directory are intentionally ignored because the adapter and local
realm state should not be committed.

After login, open `http://localhost:3000/api/auth/session` to confirm the server accepted
the verified Tide identity. The response includes only the synchronized subject, display
name, email, and authentication source; it never returns the access token.

For full native Tide operations such as E2EE, provide the generated adapter JSON through
the ignored `TIDECLOAK_ADAPTER_JSON` and `NEXT_PUBLIC_TIDECLOAK_ADAPTER_JSON` variables.
Do not commit those values.

Do not broaden BusinessVault CSP based only on CSP warnings emitted by Tide or an ORK error
page. Add an origin only when a working Tide flow proves that BusinessVault itself blocks a
required resource.

Stop the stack:

```bash
docker compose down
```

Remove data stored in Compose-managed volumes (a custom `POSTGRES_DATA_DIR` is retained):

```bash
docker compose down -v
```

## Encrypted document vault

The vault stores documents as ciphertext only. Files and filenames are encrypted in the
browser; the server receives ciphertext, a SHA-256 of the ciphertext, and minimized
metadata (declared MIME type, ciphertext size, classification, uploader, timestamps).
The browser uploads ciphertext directly to MinIO through a presigned POST whose policy
fixes the object key, `application/octet-stream`, and a byte range. The server re-checks
size and hash before marking a document available.

```text
GET  /api/organizations/:organizationId/documents
POST /api/organizations/:organizationId/documents/upload-init
GET  /api/organizations/:organizationId/documents/:documentId
POST /api/organizations/:organizationId/documents/:documentId/commit
POST /api/organizations/:organizationId/documents/:documentId/download
```

- UI: `/dashboard/vault`; Tide realm test panel: `/dashboard/vault/diagnostics`.
- Encryption: Tide `doEncrypt`/`doDecrypt` with tag `vault` (realm roles
  `_tide_vault.selfencrypt` and `_tide_vault.selfdecrypt`). In `AUTH_MODE=development`
  the UI uses a clearly labelled **DEMO — NOT E2EE** browser AES key instead, and the
  server rejects that format whenever `AUTH_MODE` is not `development`.
- Decryption is **uploader-only** (Tide self-decrypt). Shared organization decryption is
  blocked on Forseti policy-protected encryption, whose policy-creation docs are not yet
  published.
- Limits: 5 MiB ciphertext by default (`VAULT_MAX_CIPHERTEXT_BYTES`, hard cap 10 MiB),
  declared-type allowlist, 15-minute pending uploads, 60-second download URLs,
  30 requests/minute per user for upload-init and download (single-instance only).
- Large-file envelope encryption is deferred until a key-wrapping design is reviewed.

Tests (Postgres and MinIO from Compose must be running; HTTP suites also need the app on
port 3000 in development auth mode):

```bash
npm run test:vault
VAULT_IT=1 npm run test:vault
```

After uploading a file containing a canary string, check that it reached no server-side
store:

```bash
node --no-warnings --experimental-strip-types scripts/vault/leak-scan.ts YOUR-CANARY-STRING
```

The feature status matrix, threat notes, and Tide verification record are in
`docs/vault/STATUS.md` and `docs/vault/TIDE_E2EE_VERIFICATION.md`.

## Current status

The repository contains the application foundation, organization and governance APIs,
and local services. Governance remains application-level. Live Tide login, external
cryptographic action authorization, and the encrypted vault require separate validation.
