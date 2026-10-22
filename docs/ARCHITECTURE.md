# Architecture and ownership

```text
Browser UI (app/page.tsx, app/dashboard/**)
  ├─ TideCloak provider/login (app/tide-provider.tsx, app/auth/**)
  └─ organization APIs (app/api/organizations/**)
       ├─ verified principal (lib/auth/**)
       ├─ membership and governance (lib/organizations.ts, lib/approvals.ts)
       └─ PostgreSQL / Prisma (lib/db.ts, prisma/**)

Future browser encryption → ciphertext-only API → object storage
Future independently verified authorization → protected executor
```

The UI may display role and request status, but the server owns all access decisions. The browser calls tenant-scoped APIs using the active organization's ID. Every server read and write must verify the principal and active membership; protected operations additionally check roles, policy, immutable payload digest, expiry, eligibility, and idempotency at execution time.

The current `REMOVE_OWNER` flow enforces application rules and records audit rows. The API explicitly labels its result **APP-LEVEL APPROVAL ONLY**. A compromised application database or executor is outside that protection. TideCloak authenticates the user when configured; Tide QEA for realm administration is distinct from a proven authorization path for an arbitrary BusinessVault action.

| Workstream | Owns | Shared contract |
| --- | --- | --- |
| Identity and TideCloak | `app/auth/**`, `app/tide-provider.tsx`, `proxy.ts`, `lib/auth/**`, `lib/tide/**` | Verified user subject, login state, documented encryption methods |
| Organization and governance | `lib/organizations.ts`, `lib/approvals.ts`, organization/request APIs, `prisma/**` | Tenant-scoped organization, member, request, approval and audit responses |
| Business services and AI | Future document APIs, vault adapter, execution gateway, AI services | Ciphertext-only storage contract, scoped tool calls, protected execution contract |
| Frontend and UX | `app/page.tsx`, `app/components/**`, `app/dashboard/**`, `app/globals.css`, browser tests | Consume stable APIs; show exact payload and honest enforcement state |

Schema, API shape, Compose, and shared docs require coordination before changing them. Frontend work can proceed against existing organization, summary, member, and request APIs. Vault and invitation UI should wait for a documented API contract before implying those actions work.
