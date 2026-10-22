# BusinessVault Peer Handoff

## Read First

Before editing, read:

- `BUSINESSVAULT_CODEX_SPEC.md`
- `PEER_HANDOFF.md`
- `SKILL.md`
- `README.md`

`PEER_HANDOFF.md` explains the current product and implementation state. `SKILL.md` contains project-specific engineering rules, security constraints, lessons learned, and the task log.

## Project

BusinessVault is a multi-tenant governance platform for businesses that share ownership of digital assets. It separates:

1. Requesting an action
2. Authorizing an action
3. Executing an action

The security objective is to make it difficult for one administrator, founder, or compromised application server to unilaterally control, expose, or destroy shared resources.

Never describe a mutable database approval row as cryptographic proof. Until a verified Tide/Forseti execution path exists, approval behavior must remain labeled `APP-LEVEL APPROVAL ONLY`.

## Repository State

- Branch: `main`
- Latest known commit: `26c10e0 pettern`
- Worktree was clean when this handoff was created
- Current branch tracks `origin/main`

Ignored local-only files may exist:

- `.env.local`
- `tidecloak-data/`
- `tidecloak-setup/`
- `.next/`
- `node_modules/`

Do not commit local TideCloak adapter files, realm data, credentials, or generated dependencies.

## Technology

- Next.js `16.4.2`, App Router
- React `19.1.0`
- TypeScript `5.8.3`
- PostgreSQL `17`
- Prisma `6.19.0`
- Docker Compose
- Node.js `22` Alpine production image
- `@tidecloak/nextjs` `0.14.40`
- MinIO-compatible local object storage using `bitnamilegacy/minio:2025.4.22`

## Architecture Map

```text
app/
  page.tsx                         Public landing page
  globals.css                     Public and authenticated UI styles
  layout.tsx                      Global metadata and Tide provider
  components/hero-scene.tsx       Animated quorum visualization
  dashboard/layout.tsx            Workspace navigation shell
  dashboard/page.tsx              Dashboard preview
  auth/login/page.tsx             TideCloak login entry point
  auth/redirect/page.tsx          TideCloak callback page
  tide-provider.tsx               Client TideCloakProvider wrapper
  api/organizations/              Organization APIs
  api/organizations/.../requests/ Approval workflow APIs

lib/
  db.ts                            Prisma singleton
  organizations.ts                 Organization and membership services
  approvals.ts                     Request, quorum, audit, and execution logic
  auth/server.ts                   Principal authentication boundary
  auth/errors.ts                   Authentication error responses
  tide/config.ts                   TideCloak config construction

prisma/
  schema.prisma                    Tenant-scoped domain model
  migrations/                      Checked-in initial migration

proxy.ts                            Next.js 16 Tide route protection
Dockerfile                          Multi-stage production build
compose.yaml                        App, migration, PostgreSQL, and object storage
README.md                           Setup and implementation notes
SKILL.md                            Project skillbook and task history
```

## Completed Phases

### Phase 0: Research and Capability Validation

Completed:

- Product and security specification reviewed.
- Current TideCloak Next.js documentation reviewed.
- Published package `@tidecloak/nextjs@0.14.40` verified.
- Documented APIs verified:
  - `TideCloakProvider`
  - `useTideCloak`
  - `createTideCloakProxy`
  - `verifyTideCloakToken`
- Local TideCloak development container started on port `8080`.
- Realm `nextjs-test` provisioned.
- Client `myclient` provisioned.
- QEA/IGA enabled.
- First Tide administrator enrolled.
- `tide-realm-admin` granted.
- Generated adapter stored locally under ignored `tidecloak-setup/tidecloak.json`.

Not yet verified:

- Interactive browser login/logout end to end.
- Browser-side Tide E2EE encrypt/decrypt round trip.
- Forseti authorization for arbitrary BusinessVault actions.
- Cryptographic proof binding at the final action executor.

### Phase 1: Application Foundation

Completed:

- Next.js application shell.
- PostgreSQL and Prisma schema.
- Initial Prisma migration.
- Compose migration service that applies migrations before the app starts.
- Organization creation and listing.
- Organization detail endpoint.
- Membership listing endpoint.
- Organization summary endpoint.
- Tenant membership checks.
- Dashboard preview shell.
- Public API-provider-style landing page.
- Responsive UI.
- Animated 3-of-5 quorum hero visualization.

### Phase 1: Approval Workflow

Completed for `REMOVE_OWNER`:

- Canonical JSON payload normalization.
- SHA-256 payload digest.
- Policy snapshot at request creation.
- Request expiry.
- Idempotency key.
- Request listing and detail.
- Approval and rejection.
- Cancellation.
- Quorum evaluation.
- Requester self-approval prevention.
- Unique approval per request and approver.
- Serializable approval transaction.
- Claim-before-execute behavior.
- Audit events for request, approval, rejection, cancellation, and execution.
- Exactly-once execution behavior.
- Owner membership changes to `REMOVED` after successful execution.

Verified locally:

- Self-approval is rejected.
- Two distinct owner approvals reach quorum.
- Owner removal executes successfully.
- A second execution is rejected.
- Outsiders cannot list or access another organization.

All approval responses explicitly say `APP-LEVEL APPROVAL ONLY`.

## Authentication State

The app has a real TideCloak integration boundary:

- `TideCloakProvider` wraps the application when Tide mode is enabled.
- `/auth/login` calls `useTideCloak().login()`.
- `/auth/redirect` handles the documented callback flow.
- `proxy.ts` protects dashboard and organization API routes in Tide mode.
- `lib/auth/server.ts` verifies `kcToken` cookies or bearer tokens using `verifyTideCloakToken`.
- Missing Tide configuration fails closed.

The default Docker Compose profile remains development mode:

```text
AUTH_MODE=development
ALLOW_INSECURE_DEV_AUTH=true
```

This development adapter is not a security boundary and must never be enabled in production.

The local ignored `.env.local` contains Tide mode values for the provisioned local realm:

```text
AUTH_MODE=tidecloak
NEXT_PUBLIC_AUTH_MODE=tidecloak
TIDECLOAK_REALM=nextjs-test
TIDECLOAK_CLIENT_ID=myclient
TIDECLOAK_AUTH_SERVER_URL=http://localhost:8080
NEXT_PUBLIC_TIDECLOAK_AUTH_SERVER_URL=http://localhost:8080
NEXT_PUBLIC_TIDECLOAK_REALM=nextjs-test
NEXT_PUBLIC_TIDECLOAK_CLIENT_ID=myclient
NEXT_PUBLIC_TIDECLOAK_REDIRECT_URI=http://localhost:3000/auth/redirect
```

Because TideCloak currently uses `localhost:8080`, live BusinessVault login is easiest outside the app container:

```bash
docker compose stop app
npm run dev
```

Then open:

```text
http://localhost:3000/auth/login
```

Do not weaken issuer validation to make Tide work inside Docker. A proper shared Docker/Tide network configuration still needs to be designed.

## API Routes

Organizations:

```text
GET  /api/organizations
POST /api/organizations
GET  /api/organizations/:organizationId
GET  /api/organizations/:organizationId/members
GET  /api/organizations/:organizationId/summary
```

Approval workflow:

```text
GET  /api/organizations/:organizationId/requests
POST /api/organizations/:organizationId/requests
GET  /api/organizations/:organizationId/requests/:requestId
POST /api/organizations/:organizationId/requests/:requestId/approve
POST /api/organizations/:organizationId/requests/:requestId/reject
POST /api/organizations/:organizationId/requests/:requestId/cancel
POST /api/organizations/:organizationId/requests/:requestId/execute
```

Current request creation supports:

```json
{
  "operationType": "REMOVE_OWNER",
  "idempotencyKey": "remove-owner-request-001",
  "payload": {
    "targetUserId": "user-id",
    "reason": "Reason with at least five characters"
  }
}
```

## Docker Workflow

Start the default local stack:

```bash
docker compose up --build
```

Services:

- App: `http://localhost:3000`
- PostgreSQL: `localhost:5432`
- Object storage API: `http://localhost:9000`
- Object storage console: `http://localhost:9001`
- TideCloak, when separately running: `http://localhost:8080`

Validate Compose:

```bash
docker compose config --quiet
```

Build:

```bash
npm run build
docker compose build --no-cache
```

Validate Prisma:

```bash
DATABASE_URL='postgresql://businessvault:businessvault@localhost:5432/businessvault' npx prisma validate
```

Create a migration:

```bash
npx prisma migrate dev --name descriptive_change
```

If PostgreSQL reports permission errors on a mounted Windows filesystem, use a Linux-native path through `POSTGRES_DATA_DIR` as documented in `README.md`.

## Security Rules

Every future API or server action must:

1. Authenticate server-side.
2. Verify active organization membership.
3. Scope all reads and writes by `organizationId`.
4. Validate input explicitly.
5. Enforce least privilege on the server.
6. Audit request and execution outcome separately.
7. Use transactions and concurrency protection.
8. Bind approvals to the exact canonical payload digest.
9. Re-check expiry, tenant, policy, and eligibility at execution time.
10. Prevent replay and duplicate execution.

Never rely on:

- React role checks as authorization
- A mutable `approved=true` field
- Decoded but unverified JWT claims
- A database-only hash chain as independent tamper proof
- Dashboard approval to control third-party provider super-admin actions
- A mock adapter silently running as production security

## Next Work

Priority order:

1. Verify interactive TideCloak login/logout with the provisioned realm.
2. Verify server-side token claims and user synchronization with a real access token.
3. Replace local development auth only after live Tide login works.
4. Add invitation creation, acceptance, expiry, and revocation.
5. Add protected policy-management APIs.
6. Add automated security tests for:
   - Cross-tenant IDOR
   - Invalid JWTs
   - Self-approval
   - Duplicate approvals
   - Expiry
   - Replay
   - Payload mutation
   - Concurrent approval
   - Concurrent execution
   - Direct API bypass
7. Implement browser-side Tide E2EE document encryption and decryption.
8. Implement ciphertext-only MinIO upload and retrieval.
9. Validate Forseti support for arbitrary application actions.
10. Only then consider changing `APP-LEVEL APPROVAL ONLY` behavior.

## Working Rules

- Do not overwrite teammate changes.
- Use `apply_patch` for manual edits.
- Keep changes small and explicit.
- Do not commit secrets, adapter JSON, realm data, or generated local files.
- Verify Tide APIs against installed package types and current vendor documentation.
- Do not invent Forseti APIs or proof formats.
- Update `SKILL.md` with significant discoveries and completed tasks.
- Run `npm run build` and `docker compose config --quiet` after meaningful changes.
- Clearly distinguish working features, application-level behavior, and unverified security claims.
