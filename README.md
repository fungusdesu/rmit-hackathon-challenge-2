# BusinessVault

BusinessVault is a security and governance layer for shared business assets.

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

The dashboard is currently a preview surface. Authentication and TideCloak-backed
authorization are deliberately not represented as complete until a real Tide realm is
verified.

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

## Approval workflow

The first protected operation is `REMOVE_OWNER`. A request is bound to a canonical payload
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

Docker Compose uses `tidecloak.localhost` for Tide issuer consistency. Browsers resolve
`.localhost` to the local machine, while Compose maps that hostname to the host gateway.
This keeps the issuer identical inside and outside Docker.

The local realm initializer generated an ignored `.env.local` with the verified development
realm values. Start the app outside Docker for the first live login test so both the browser
and the server can reach TideCloak at `localhost:8080`:

```bash
npm run dev
```

Then open `http://localhost:3000/auth/login`. The generated `tidecloak-setup/` directory
and `tidecloak-data/` directory are intentionally ignored because the adapter and local
realm state should not be committed.

For full native Tide operations such as E2EE, provide the generated adapter JSON through
the ignored `TIDECLOAK_ADAPTER_JSON` and `NEXT_PUBLIC_TIDECLOAK_ADAPTER_JSON` variables.
Do not commit those values.

Stop the stack:

```bash
docker compose down
```

Remove data stored in Compose-managed volumes (a custom `POSTGRES_DATA_DIR` is retained):

```bash
docker compose down -v
```

## Current status

The repository currently contains the runnable application foundation and local services.
TideCloak integration, Prisma schema/migrations, governance workflows, and encrypted vault
behavior will be added only after their documented capabilities are verified.
