# Project status

This is a repository snapshot, not a claim that Tide-backed authorization or encrypted file storage works end to end. See [the implementation plan](./IMPLEMENTATION_PLAN.md) for ownership and next steps.

| Area | Implemented | Incomplete or missing |
| --- | --- | --- |
| Application | Next.js 16 App Router, React 19, TypeScript, Docker build and Compose | Production deployment and monitoring |
| Persistence | PostgreSQL 17, Prisma schema, initial migration, migration startup job | Backup and recovery procedures |
| Identity | TideCloak provider, login and callback pages, route proxy, server token verification boundary; explicit development auth adapter | Interactive login/logout and verified claims in the provisioned realm |
| Organizations | Create, list, detail, members and summary APIs with membership checks | Invitations, role changes, succession, organization setup completion |
| Governance | `REMOVE_OWNER` request, digest, policy snapshot, approval/rejection/cancellation, execution and audit rows | Configurable policy API, complete security tests, independently enforced proof |
| Documents | Data model and local MinIO service | Browser encryption, ciphertext upload/retrieval, decryption round trip |
| UI | Responsive landing page with interactive node network and quorum visualization; dashboard shell; live organization overview and request review; six labeled feature-preview screens | Request creation, live invitation/member/vault workflows; browser test suite |
| AI and integrations | Product specification | Assistant, protected gateway, provider integrations |

The approval API currently provides **APP-LEVEL APPROVAL ONLY**. Its database records are application state, not cryptographic proofs. TideCloak's arbitrary-action Forseti path and a final executor that verifies such proof remain unverified.

The dashboard reads organization summary and request data through existing APIs, offers an initial organization creation flow, and shows exact request parameters before approval or rejection. Approvals, vault, members, assets, audit, and settings now have navigable, interactive interface previews with explicitly illustrative data; they do not call or replace pending feature APIs. No automated tests are checked in. Current development Compose mode uses an explicit insecure local identity adapter. The Tide realm and adapter files are local and ignored; browser login and E2EE have not been confirmed.

Repository inspection found Next.js, Prisma, the TideCloak SDK, and no Tailwind. Keep the existing CSS system. `POSTGRES_DATA_DIR` may point to a Linux filesystem on hosts whose Docker data lives on a Windows drive.
