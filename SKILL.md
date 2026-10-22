# BusinessVault Project Skillbook

## Purpose

This file records the project-specific engineering skills, decisions, workflows, and tasks learned while building BusinessVault. Read it before making future changes.

## Product Context

BusinessVault is a multi-tenant governance platform for shared business assets. Its security goal is to prevent one administrator, founder, or compromised application server from unilaterally controlling protected organizational resources.

The product must distinguish between:

- Requesting an action
- Authorizing an action
- Executing an action

Application database approval rows are mutable application state. They are not cryptographic proof. Until a real Tide-backed authorization path is verified, protected approvals must be labeled `APP-LEVEL APPROVAL ONLY`.

## Current Stack

- Next.js 16.4.2 with App Router
- React 19.1.0
- TypeScript 5.8.3
- PostgreSQL 17
- Prisma 6.19.0
- MinIO-compatible object storage using `bitnamilegacy/minio:2025.4.22` for local development
- Docker Compose
- Node.js 22 Alpine production image

## Repository Map

```text
app/
  page.tsx                 Public landing page
  layout.tsx              Global metadata and styles
  globals.css             Public and dashboard design system
  dashboard/
    layout.tsx            Workspace shell and navigation
    page.tsx              Dashboard preview
lib/
  db.ts                   Prisma client singleton
prisma/
  schema.prisma           Tenant-scoped domain schema
Dockerfile                 Multi-stage production image
compose.yaml               App, PostgreSQL, and object storage
.env.example               Local environment variable names
README.md                  Local setup and database notes
BUSINESSVAULT_CODEX_SPEC.md Product and security specification
```

## UI Skill

Use a restrained, mature API-provider visual language:

- Dark public marketing surface with muted green security accent
- Light authenticated workspace with dark navigation rail
- Manrope for interface text and DM Mono for labels, metadata, status, and identifiers
- Thin borders, quiet shadows, compact density, and clear hierarchy
- Avoid generic gradients, excessive rounded cards, bright dashboards, and decorative noise
- Keep navigation, status, and action states explicit
- Maintain responsive layouts for desktop and mobile
- Do not imply functionality that is not implemented
- Preview-only screens must show a clear preview or integration limitation notice

The public page is the first impression. The dashboard is an authenticated-ready preview until TideCloak auth is wired.

## Security Skill

Every future API or server action must:

1. Authenticate the principal server-side.
2. Verify organization membership and active status.
3. Scope all reads and writes by `organizationId`.
4. Validate input with an explicit schema.
5. Enforce least privilege on the server.
6. Audit the request and the outcome separately.
7. Use transactions and optimistic concurrency for state changes.
8. Bind approvals to the exact canonical payload digest.
9. Check expiry, eligibility, policy version, and tenant again at execution time.
10. Make execution idempotent and prevent replay.

Never rely on:

- React role checks as authorization
- A mutable `approved` Boolean
- Decoded but unverified JWT claims
- A database hash chain as independent tamper proof
- Dashboard approval to control third-party provider super-admin actions
- A mock or demo adapter silently running as production security

## Database Skill

The Prisma schema is intentionally organization-scoped. Current entities include:

- `Organization`
- `User`
- `Membership`
- `Invitation`
- `Asset`
- `Document`
- `Policy`
- `ActionRequest`
- `Approval`
- `Execution`
- `AuditEvent`

Important constraints already modeled:

- Unique membership per organization and user
- Unique invitation token hash
- Unique request idempotency key within an organization
- Unique approval per request and approver
- Organization indexes for status, role, and time-based queries
- Foreign keys with explicit delete behavior

Before changing the schema, check whether a persisted migration exists. Create migrations with:

```bash
npx prisma migrate dev --name descriptive_change
```

Do not use destructive resets against shared or user-created data.

## Docker Skill

The peer workflow is:

```bash
docker compose up --build
```

Services:

- App: `http://localhost:3000`
- PostgreSQL: `localhost:5432`
- Object storage API: `http://localhost:9000`
- Object storage console: `http://localhost:9001`

The Compose credentials are development-only. Never expose the local stack publicly or reuse its secrets.

The Dockerfile uses:

- Dependency stage with `npm ci`
- Builder stage with `npx prisma generate` and `npm run build`
- Non-root `nextjs` runtime user
- Next standalone output

The official `minio/minio` image was unavailable from the current registry environment. The local fallback is the Bitnami legacy image, pinned to a known working version and configured with `user: "0:0"` so its named volume initializes correctly in this environment.

Useful validation commands:

```bash
docker compose config --quiet
docker compose ps
curl --fail http://localhost:3000/
curl --fail http://localhost:3000/dashboard
docker compose down
```

## TideCloak Integration Skill

TideCloak must be verified against current vendor documentation and installed package types before implementation claims are made.

Known documented areas to validate:

- Next.js provider and login/logout flow
- Server-side `verifyTideCloakToken`
- JWT issuer, audience, expiry, signature, and algorithm validation
- Browser `doEncrypt` and `doDecrypt`
- E2EE roles and tags
- QEA prerequisites and licensing
- Forseti request format, deployment, contracts, and proof verification

Do not invent Tide APIs, proof formats, parameters, or arbitrary application authorization support. If no real Tide realm is available, keep the integration behind an explicit adapter boundary and label the implementation as incomplete.

## Implementation Workflow

For each feature:

1. Read the specification and inspect existing files.
2. Identify the trust boundary and adversary assumptions.
3. Implement the smallest complete vertical slice.
4. Keep demo/mock integrations separate from real integrations.
5. Add negative security tests before calling a feature protected.
6. Run the Docker build because Docker is the supported peer workflow.
7. Update this file with the task, decision, validation, and remaining limitation.

Use `apply_patch` for manual file edits. Keep changes small and avoid unrelated rewrites.

## Current Status

Completed:

- Specification reviewed and implementation plan established
- Runnable Next.js application created
- Docker Compose app, PostgreSQL, and object storage stack created
- Compose migration service added so fresh stacks apply checked-in Prisma migrations
- Production Docker build validated
- Professional public landing page implemented
- Dashboard preview shell implemented at `/dashboard`
- Prisma tenant-scoped domain schema added
- Prisma client generation included in the Docker build
- Initial Prisma migration generated and applied automatically by Compose
- Explicit development-only authentication adapter added
- Organization listing, creation, detail, and membership endpoints added
- Canonical action payloads, SHA-256 request digests, policy snapshots, and idempotency handling added
- Approval, rejection, cancellation, and exactly-once owner-removal execution routes added
- Verified `@tidecloak/nextjs@0.14.40` APIs wired for provider, proxy, and server token validation
- Tide public build arguments separated from runtime server configuration
- Local TideCloak `nextjs-test` realm provisioned with QEA and `myclient` adapter
- Full Tide adapter JSON support added for server and client configuration
- Tide logout route added at `/auth/logout`
- README and environment defaults added

Not completed:

- TideCloak authentication
- Live TideCloak realm validation and login test
- TideCloak E2EE round-trip test
- Invitation acceptance flow
- Configurable policy management API
- Browser-side Tide E2EE vault flow
- S3/MinIO ciphertext upload flow
- Audit API and independent anchoring
- Unit, integration, and Playwright security tests
- Forseti capability validation

Known dependency note:

- `npm audit` currently reports four high-severity advisories through the Prisma 6 development tooling dependency tree. Re-evaluate Prisma version compatibility before production use; do not force-upgrade across a Prisma major without testing schema generation and runtime client behavior.

## Next Tasks

The next implementation slice is:

1. Add a Tide integration capability report and explicit adapter interfaces.
2. Add verified server authentication middleware or document the blocker.
3. Add invitation creation, acceptance, expiry, and revocation.
4. Add policy management with protected policy changes.
5. Add security-focused automated tests for IDOR, self-approval, replay, expiry, payload mutation, and race conditions.
6. Integrate the browser-side encrypted vault after Tide E2EE capability validation.

### 2026-10-22: Project synchronization and live overview

- Reconciled the attached product brief with the current repository and added status, architecture, implementation, Tide setup, and security-model documents under `docs/`.
- Kept frontend changes within `app/dashboard/**` and `app/globals.css`; existing server authorization and Prisma schema were not changed.
- Replaced dashboard preview metrics with tenant-scoped organization summary and request API data, added first-organization creation, and added a request review screen showing exact payload and `APP-LEVEL APPROVAL ONLY` before decisions.
- Removed links to pages that do not yet exist and labeled planned areas in the navigation.
- Browser login, Tide E2EE, independent action proof, invitation flow, and automated security tests remain to be completed by their respective tracks.

## Task Log

### 2026-10-22: Governance lifecycle implementation

- Added invitation creation, listing, revocation, and single-use acceptance with hashed tokens and verified-email matching.
- Added three-owner governance activation and protected privileged invitation, membership, and policy operations.
- Rechecked current approver eligibility and request digests at execution; owner removal excludes the target from voting and preserves three active owners.
- Added tenant-scoped member, policy, and audit APIs, plus PostgreSQL-backed HTTP governance tests.
- Kept the explicit `APP-LEVEL APPROVAL ONLY` boundary; the audit hash chain is not independently anchored.
- Build, TypeScript, Prisma validation, Compose config, migration deployment, and the PostgreSQL-backed governance HTTP suite passed using the local default Docker context.

### 2026-10-22: Repository bootstrap

- Learned that the repository initially contained only the product specification.
- Created the Next.js and TypeScript foundation.
- Added Docker Compose for the application, PostgreSQL, and object storage.
- Validated the production image and Compose configuration.

### 2026-10-22: Registry compatibility

- Learned that `minio/minio` and the official Quay reference were unavailable from the active Docker registry environment.
- Tested available public images.
- Selected pinned `bitnamilegacy/minio:2025.4.22` for local development.
- Added a root user override because the image could not initialize its named volume with its default UID in this environment.

### 2026-10-22: Public UI refinement

- Replaced the placeholder page with a mature security-platform marketing surface.
- Added responsive navigation, product preview, feature sections, security boundary language, and footer.
- Used a dark green security-oriented visual system and restrained API-provider layout patterns.

### 2026-10-22: Application shell

- Added a workspace dashboard at `/dashboard`.
- Added navigation for requests, approvals, vault, members, assets, audit, and settings.
- Added explicit preview-environment messaging so the UI does not overclaim authentication or cryptographic enforcement.

### 2026-10-22: Domain model

- Added Prisma models for tenant-scoped organizations, membership, assets, documents, policies, action requests, approvals, executions, and audit events.
- Added unique constraints for membership, approval, invitation, and idempotency behavior.
- Added Prisma generation to the Docker build.

### 2026-10-22: First functional API slice

- Generated `prisma/migrations/20261022050123_initial/migration.sql`.
- Added a server-side `requirePrincipal` boundary.
- Kept TideCloak as the default authentication mode so unconfigured production-like requests fail closed.
- Added a development adapter requiring both `AUTH_MODE=development` and `ALLOW_INSECURE_DEV_AUTH=true`.
- Added organization creation and listing with membership-scoped queries.
- Added organization detail and active-membership endpoints.
- Added an organization summary endpoint for dashboard metrics.
- Verified an outsider receives an empty organization list and cannot use another organization's membership endpoint.
- Added a Compose migration service that waits for PostgreSQL health before starting the app.
- Learned that `NODE_ENV` can be compile-time inlined by Next.js; runtime development auth therefore uses an explicit opt-in flag instead of relying only on `NODE_ENV`.

### 2026-10-22: Approval workflow

- Added canonical JSON normalization and SHA-256 payload digests.
- Added `REMOVE_OWNER` request creation and listing routes.
- Added request-specific approval, rejection, cancellation, and execution routes.
- Added policy snapshots, expiry checks, requester self-approval prevention, unique approver constraints, and serializable approval transactions.
- Added transaction claim-before-execute behavior to prevent duplicate execution.
- Added audit events for request, approval, rejection, cancellation, and execution transitions.
- Verified local end-to-end behavior: self-approval rejected, two distinct owner approvals authorized the request, owner removal executed once, and a second execution was rejected.
- Kept every response explicitly labeled `APP-LEVEL APPROVAL ONLY` because Tide cryptographic enforcement is not connected.

### 2026-10-22: TideCloak integration boundary

- Verified the published `@tidecloak/nextjs@0.14.40` package and its documented exports.
- Added `TideCloakProvider` for App Router client state.
- Added `/auth/login` and `/auth/redirect` flows using `useTideCloak`.
- Added Next.js 16 `proxy.ts` protection for dashboard and organization API routes.
- Added server-side `verifyTideCloakToken` validation using issuer, client, signature, and expiry checks supplied by the SDK.
- Added runtime environment configuration for server values and build-time public client values.
- Learned that top-level proxy configuration can be evaluated during build; Tide configuration is therefore resolved inside the proxy request function.
- Verified the SDK integration boundary builds successfully, but no live Tide realm credentials are present, so live login and E2EE remain unverified.

### 2026-10-22: Local Tide realm provisioning

- Started `tideorg/tidecloak-dev:latest` on port `8080` with persistent ignored local data.
- Reran the generated `init/tcinit.sh` after the first attempt failed because no TideCloak server was running.
- Provisioned realm `nextjs-test` and client `myclient`.
- Completed Tide realm setup, QEA enablement, first-admin enrollment, and admin-role grant.
- Generated the ignored adapter at `tidecloak-setup/tidecloak.json`.
- Added ignored `.env.local` values for BusinessVault live Tide testing.
- Verified the live Tide proxy rejects an unauthenticated API request with `401`.
- Learned that Tide's signed vendor return URL must match exactly; the Linux app container uses host networking so browser and server both use `http://localhost:8080`.

### 2026-10-22: Tide runtime hardening

- Wrapped SDK verification failures so malformed or invalid token errors return authentication failure rather than an internal server error.
- Verified Tide realm discovery returns HTTP `200`.
- Verified Tide-mode `/auth/login` and `/auth/logout` routes load.
- Verified missing-token and malformed-bearer requests return HTTP `401`.
- Added support for the generated full Tide adapter JSON without committing it.
- Resolved Docker-to-host issuer networking with Linux host networking, preserving the provisioned `http://localhost:8080` issuer.
- Diagnosed `TIDE-SWE-UNHANDLED` as a frontend build missing the generated Tide vendor/ORK/client-origin adapter fields.
- Added the full ignored adapter to server runtime and the public Next.js build; verified the server parses `vendorId` and the client bundle contains the generated vendor configuration.
- Diagnosed `Invalid Vendor Return URL` as use of an unprovisioned `tidecloak.localhost` alias; restored the exact signed `localhost:8080` return host.
- Added `/api/auth/session` to return only the verified Tide principal, never token material.
- Added six Tide verifier tests covering valid, wrong-issuer, wrong-client, expired, invalid-signature, and malformed tokens.
- Removed the local router redirect race from logout so the Tide SDK owns session termination.
- Determined the observed ORK CSP warning accompanied the invalid return-URL error; BusinessVault CSP was not broadened without evidence of a blocked working flow.
- Learned that Docker Compose's app container still uses the development auth profile by default; live Tide testing currently runs the BusinessVault server directly with `npm run dev` so both server and browser resolve TideCloak through `localhost:8080`.

### 2026-10-22: Larger UI and feature previews

- Increased workspace typography and control sizes, and replaced abstract navigation and feature symbols with recognizable SVG icons.
- Added a pointer-reactive node network across the public landing page behind the existing quorum visualization. Reduced-motion visitors get a still rendering; the motion control pauses both layers.
- Built navigable, interactive UI previews for approvals, vault, members, assets, audit, and settings with search, filters, and record details.
- Kept every sample screen visibly labeled as illustrative. Existing organization and protected-request APIs remain the only connected workflows; no pending security capability is represented as active.
- Validated a production Docker build, all six preview routes, filtering and selection, desktop and mobile rendering, and lack of horizontal overflow.
