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

Stop the stack:

```bash
docker compose down
```

Remove local database and object-storage data:

```bash
docker compose down -v
```

## Current status

The repository currently contains the runnable application foundation and local services.
TideCloak integration, Prisma schema/migrations, governance workflows, and encrypted vault
behavior will be added only after their documented capabilities are verified.
