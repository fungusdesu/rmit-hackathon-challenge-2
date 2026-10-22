# BusinessVault — Product Requirements, Security Architecture, and Codex Implementation Brief

**Status:** Proposed product / implementation blueprint, not a description of an existing deployed system  
**Working name:** BusinessVault  
**Prepared:** 2026-10-22  
**Audience:** Codex, engineering contributors, security reviewers, and product designers  
**Priority:** Secure, demonstrable MVP first; expand to integrations after proving security properties.

> **Mission:** Make it technically difficult for any one business administrator, founder, or compromised application server to unilaterally seize, expose, or destroy digital assets collectively owned by an organization.

## 0. Instructions for Codex (read first)

You are implementing **BusinessVault**, a multi-tenant security and governance web application. Treat this document as a product/engineering specification, not as proof that all TideCloak capabilities exist as APIs. Your job is to build the smallest *real and secure* vertical slice, verify external APIs against current vendor documentation/source, and explicitly report remaining security limitations.

1. Inspect the existing repository, tooling, environment, and README before editing. Do not overwrite unrelated work.
2. Check the actual TideCloak documentation and available SDK packages/types. Do not invent TideCloak, Forseti, QEA, or E2EE methods, parameters, permission models, or proof-verification APIs.
3. Start with a runnable vertical slice: organizations, membership, roles, approval requests, encrypted document storage, and an auditable protected action.
4. Treat **UI approvals as untrusted until verified and enforced at the final operation boundary**. A database Boolean `approved=true` is not cryptographic enforcement.
5. Create separate **real Tide integration** and **clearly named demo/mock integration** paths. A mock is never a security guarantee and must not silently run in production.
6. Before implementing custom Forseti policy rules, check its actual extension/deployment mechanism, signing/proof semantics, licensing, supported actions, and feasibility. If unavailable, mark the relevant acceptance criterion *blocked* rather than falsely claiming it works.
7. All high-impact operations must be checked server-side and, if supported, backed by verifiable Tide authorization bound to **exact action, organization, resource, parameters, requester, quorum, expiry, and unique request ID**.
8. Prefer a straightforward, maintainable implementation; provide tests, README, `.env.example`, setup instructions, threat-model notes, and a feature status matrix.
9. Never use production funds, secrets, live social-media super-admin credentials, or destructive external actions during development. Use sandbox integrations.
10. When facts about a current SDK or service are unclear, consult the linked primary documentation and say what was verified and what remains an assumption.

### Recommended Codex kickoff prompt

> Read `BUSINESSVAULT_CODEX_SPEC.md` fully. Audit the current repository. Produce a short implementation plan and capability-validation checklist, then implement Phase 1 as a working vertical slice. Use TypeScript, Next.js, PostgreSQL, Prisma, and TideCloak where its current SDK actually supports the integration. Do not fake security enforcement: add explicit demo adapters if needed and label them non-production. Add security-focused automated tests, setup documentation, and a final report listing working features, limitations, and blocked Tide API dependencies. Start coding after checking the repository and available SDK documentation.

---

## 1. Problem and motivation

Organizations collectively own digital assets, but their operational control is often concentrated in individual administrator accounts. When that person leaves, becomes malicious, loses access, or is compromised, the entire group can lose access or suffer serious damage.

**Examples / inspiration:**

- A social community owner delegates administration to a helper who then removes other admins.
- A collaborative development organization loses control of repositories when a privileged account removes its members.
- A marketing agency or employee controls the only administrator account for a client's advertising assets.
- A founder can export proprietary data, revoke co-founders' access, or delete shared files.
- A database administrator can read sensitive records if keys are available to the application backend.
- A compromised automation or AI agent performs destructive administrative actions without meaningful human authorization.

These are broad pain-point categories; individual online anecdotes are not independent proof of prevalence or commercial demand. Validate with interviews.

### The core problem statement

**Something owned by five people should not be controllable or destructible by one person solely because that person has an administrator role.**

### Product principle

Separate the ability to **request** an action from the authority to **authorize** it and the technical capability to **execute** it.

### Important distinction

A normal multi-approval app can count votes in a database. A compromised administrator might change those rows. BusinessVault should aim to enforce approvals at cryptographic and execution boundaries so a compromised application database or ordinary admin cannot simply bypass the policy. This goal is only achieved for integrations where such enforcement is technically possible.

---

## 2. Product vision

BusinessVault is a web application where a business can:

1. Register an organization and invite multiple owners or employees.
2. Define ownership, administrative roles, and quorum policies.
3. Store sensitive business files as ciphertext, with authorized client-side decryption when supported.
4. Submit, approve, reject, expire, and audit requests for high-risk actions.
5. Govern owner removal, role changes, deletion, and privileged access.
6. Maintain a registry of external assets (GitHub organizations, marketing accounts, finance accounts, infrastructure, and other systems).
7. Integrate with external services where they support restricted scoped credentials and enforceable workflows.
8. Maintain recovery and business-continuity mechanisms that avoid dependence on any one person's laptop or account.

### Initial target customer

Small-to-medium businesses and early-stage startups with 2–10 founders/owners; agencies managing important shared digital assets; organizations with sensitive intellectual property.

### Non-goal

Do **not** build a full accounting ERP, payroll system, social media management suite, banking application, or cloud provider in the MVP. BusinessVault is a *security/governance layer*, not an attempt to reproduce all enterprise software functionality.

---

## 3. Practical use cases and explicit boundaries

| Area | Specific risky action | BusinessVault target rule | Important enforcement limitation |
|---|---|---|---|
| Organization governance | Remove a founder / transfer ownership | 4-of-5 owners authorize | Protect BusinessVault roles directly; third-party roles require third-party control/API support |
| Confidential documents | Export or decrypt sensitive customer files | 3-of-5 owners or designated data stewards authorize | Ciphertext and E2EE must be real; export policy needs cryptographic binding and enforcement |
| Document retention | Permanently delete critical records | 4-of-5 owners plus retention checks | Storage backups, object-lock, and privileges must prevent bypass |
| Shared secrets | Reveal a production API credential | 2-of-3 trusted approvers authorize short-lived release | Key handling, rotations, and privileged bypass must be carefully designed |
| GitHub/release management | Publish release or change protected repo configuration | 2-of-3 maintainer approval | Prefer protected environments/rulesets and scoped automation tokens; native owners may remain able to bypass |
| Marketing asset governance | Change marketing super-admin | 3-of-5 owner approval | Meta/Google platform-native admin controls are **not overridden** by our dashboard |
| Financial authorization | Send a large payment | 3-of-5 finance approvers | Bank/payment provider must enforce the constraint; dashboard approval alone cannot stop native transfers |
| AI agent control | Delete a database / deploy destructive config | Human approval and command-specific capability | Execution gateway must hold exclusive relevant execution privilege |
| Account recovery | Replace an unavailable owner | Survivors authorize a governed recovery | Must resist collusion/impersonation and avoid creating an unrestricted break-glass backdoor |

### Case A — malicious co-founder

A five-owner startup stores confidential design and customer data. One owner wants to remove another owner and download sensitive records.

- They may **request** the actions.
- Removal requires an owner quorum.
- File export requires explicit authorization; the backend only stores ciphertext.
- Denials, approvals, changes, and execution outcomes appear in an immutable-*style* audit trail (tamper-evident only if independently protected).
- A direct database edit cannot count as external cryptographic approval.

### Case B — employee departure

The only marketing administrator resigns. BusinessVault should track current access, alert other owners, and use supported provider integrations to facilitate transfer. It **cannot guarantee** recovery from a third-party platform if that platform retains a single uncontrollable super-admin path.

### Case C — stolen database

An attacker copies PostgreSQL and object-storage data. They see metadata and ciphertext but should not get plaintext confidential files from storage alone. Note that metadata itself may be sensitive and must be minimized.

### Case D — compromised backend

The backend can read and modify its own database and attempt protected actions. The MVP must demonstrate what remains protected (e.g., client-held decryption capability and valid external approval proofs) and clearly identify what remains vulnerable (e.g., metadata integrity, availability, direct use of backend-owned external API credentials). Do not overclaim safety.

---

## 4. TideCloak overview: facts versus proposed product features

TideCloak is a Keycloak-based identity and access-management product backed by Tide's Cybersecurity Fabric. Documented areas include OIDC/OAuth integration, login/logout, token handling, role-based access, quorum-enforced governance (QEA), tag-based end-to-end encryption helpers, and a programmable policy engine named Forseti.

**Critical JWT clarification:** Tide does **not** normally distribute each user's JWT across their machines. Users still receive and present access tokens. The distributed network participates in cryptographic authority (e.g., protected signing). Stolen bearer tokens can still be replayed unless separately mitigated. JWT payloads are generally base64url-encoded, not inherently encrypted.

**Where nodes are:** Tide Fabric nodes run on separate network infrastructure, not only on a user's laptop. The user's browser/device participates in enrollment, authentication, and local decryption operations; a destroyed laptop does not automatically destroy centrally registered identity or remote distributed key shares. Recovery conditions depend on actual deployment and factors.

**TideCloak is not a blockchain.** Threshold cryptographic cooperation and decentralized authority do not imply a replicated public ledger or cryptocurrency consensus.

### Capability map

| Capability | Tide status based on public docs | BusinessVault treatment |
|---|---|---|
| OIDC authentication, Next.js SDK | Documented | Implement and test real login, logout, token validation |
| Role-based access control (RBAC) | Documented | Use as one authorization input, with server-side checks |
| QEA identity/realm administrative changes | Documented | Explore for governed role/admin modifications; do not assume arbitrary app actions automatically use it |
| Browser-side `doEncrypt` / `doDecrypt` | Documented | Prototype encrypted data fields/files within actual input/size constraints |
| Encryption role/tag configuration | Documented | Provision/test strictly scoped decrypt roles |
| Forseti programmable authorization | Documented concept, C# custom logic | Validate practical API, deployment, proofs, licensing, and action binding before relying on it |
| Business approval workflow engine | Our product | Implement UI, state machine, quorum rules, expiry, idempotency, notifications |
| Financial transfers | NOT provided by TideCloak | Integrate supported bank/payment sandbox later |
| Control of Meta/Google super-admin privileges | NOT provided by TideCloak | External API only if supported; no bypass claims |
| Object storage / backups / retention | NOT provided by TideCloak | Build with S3-compatible storage and retention policies |
| Automated infrastructure control | NOT provided by TideCloak | Build scoped executor with an enforceable gate |

### Primary documentation, to verify at implementation time

- Home: https://docs.tide.org/
- Core concepts: https://docs.tide.org/Core-Concepts/core-concepts
- Next.js SDK: https://docs.tide.org/Languages/NextJS/tidecloak-nextjs-intro
- Encryption setup: https://docs.tide.org/Admin/e2ee
- Forseti: https://docs.tide.org/Core-Concepts/forseti-engine
- FAQ: https://docs.tide.org/FAQ/
- Getting started repo: https://github.com/tide-foundation/tidecloak-gettingstarted
- Tide GitHub: https://github.com/tide-foundation

### Minimal vendor quickstart (development only)

The vendor documents a TideCloak development container and Next.js scaffold. These examples are illustrative; check current documentation before running:

```bash
# Development ONLY; never expose example credentials to the public Internet.
docker run -d -p 8080:8080 \
    -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
    -e KC_BOOTSTRAP_ADMIN_PASSWORD=password \
    tideorg/tidecloak-dev:latest

npm init @tidecloak/nextjs@latest businessvault
cd businessvault
npm install
npm run dev
```

SDK documentation shows `useTideCloak()` and `doEncrypt` / `doDecrypt` patterns. Verify actual package version and TypeScript signatures rather than copying snippets untested. Tide's E2EE documentation says the realm needs Tide IdP, appropriate licensing, QEA, and encryption/decryption roles. Never enable broad default decrypt roles in production simply to make a demo work.

---

## 5. Proposed architecture

```text
  Founder / Employee / Approver Browsers
                |
       OIDC login / session
                v
          BusinessVault UI (Next.js)
                |
                v
       BusinessVault API / BFF
       + organization scope checks
       + request state machine
       + audit and metadata
                |
     +----------+-------------+------------------+
     |          |             |                  |
     v          v             v                  v
 PostgreSQL    Object      TideCloak         Integration
(metadata,     storage     and Fabric          gateway
 approvals,    (cipher-    (auth, E2EE,        (GitHub,
 resources)     text)        QEA, policies)    finance, etc.)
                                                   |
                                              External systems
```

### Security layers

- **Authentication:** OIDC through TideCloak. Never treat a decoded JWT as verified; validate signature, issuer, audience, expiration, and relevant token type at the API boundary.
- **Tenant isolation:** Every resource and query includes organization scope, verified memberships, and permissions; avoid IDOR and cross-tenant data leaks.
- **Business request state:** Backend stores request and approvals, but must never interpret its own mutable state as unforgeable proof.
- **Tide authorization:** For operations Tide can cryptographically authorize, validate exact capability/proof and prevent replay. Proof verification format must come from confirmed Tide documentation.
- **Document confidentiality:** Prefer client-side Tide E2EE flows. The backend persists ciphertext and metadata; decryption stays client-side for authorized users.
- **External operations:** A trusted, least-privilege gateway verifies approval and executes precisely scoped action; no direct alternative credential route for intended protections.
- **Audit:** Append-only application events plus independent export/anchoring for tamper evidence; an ordinary DB audit table alone is editable by a database superuser.

### Trust boundaries

1. Browser is untrusted for authorization decisions; it can still hold legitimately decrypted plaintext.
2. Application API may be compromised; define precisely which guarantees survive.
3. PostgreSQL/object storage may be read or altered by a privileged operator.
4. Tide network is an external cryptographic dependency whose availability and security are assumptions to test.
5. External providers have their own administrator/root privileges and may defeat approval rules outside BusinessVault.

---

## 6. Recommended technology stack

- **Frontend:** Next.js (App Router), React, TypeScript, accessible component primitives.
- **Authentication:** TideCloak supported Next.js SDK and OIDC; backend token verification using documented SDK/JWKS validation.
- **Backend:** Next.js server routes or a small Node/TypeScript service; separate privileged integration executor module.
- **Database:** PostgreSQL with Prisma migrations, strict tenant foreign-key patterns.
- **Files:** S3-compatible object storage (MinIO locally), ciphertext-only on storage for encrypted content.
- **Queue (later):** BullMQ/Redis or equivalent for retryable execution, outbox, and notifications.
- **Tests:** Vitest/Jest for units, Playwright for E2E, HTTP integration tests, containerized Postgres/MinIO when available.
- **Local dev:** Docker Compose for app dependencies; TideCloak dev server per vendor instructions.
- **Deployment:** HTTPS, managed DB and object storage, locked-down service accounts, secrets manager, separate Tide config.

Choose tools compatible with any existing codebase. Do not add unnecessary infrastructure to the MVP.

---

## 7. Product modules and navigation

**Primary navigation:** Overview / My Requests / Approvals / Vault / Members & Owners / Asset Registry / Audit Log / Organization Settings.

### 7.1 Organization and membership

- Create organization, name, description, and owners.
- Invite member, accept/expire/revoke invitation.
- Membership roles: OWNER, ADMIN, MEMBER, AUDITOR (illustrative application roles, distinct from Tide roles).
- Ownership changes are *protected operations*; cannot be committed solely via a generic membership CRUD endpoint.
- Defined quorum per operation and eligible approver set; policy snapshots at request creation.
- Prevent self-approval if policy requires separation of duties.
- No single-owner bootstrap loophole once the organization is initialized; bootstrap and recovery must be explicitly designed.

### 7.2 Request and approval center

- Request action: target resource, proposed changes, reason, expiry, risk tier.
- Show exact canonical parameters to approvers before consent.
- Sign/verify decisions if Tide supports the relevant policy; otherwise flag demo approvals.
- Reject, cancel, expire, and resubmit; never silently modify already-approved action parameters.
- Prevent duplicate approvals, stale-membership approvals, and replayed requests.
- Approver notifications and request timeline.

### 7.3 Encrypted document vault

- Upload, retrieve ciphertext, decrypt locally, optional versioning, retention label.
- Do not transmit plaintext to the backend in a purported E2EE flow.
- Verify current Tide E2EE API data size/type constraints; use secure envelope encryption for large files **only after** a reviewed key-wrapping design is validated.
- Keep storage object IDs unguessable and authorize metadata access server-side.
- Differentiate file viewing from exporting ciphertext versus authorized plaintext release.
- No plaintext in logs, error traces, URL query parameters, analytics, or server thumbnails.

### 7.4 Asset registry

- Record provider, resource identifiers, business owner, custodians, current admin contacts, criticality, review date, and access recovery plan.
- MVP is inventory/alerts only; do not claim to control Facebook or banking super-admin capabilities.
- Later: provider sync through official APIs, supportability matrix, and privileged-operation adapters.

### 7.5 Audit and recovery

- Log actor, tenant, target, policy version, request digest, decision, timestamps, source, and actual execution outcome.
- Separate approval from execution success/failure.
- Hash-chain or independent anchoring can make edits detectable **only if** trusted anchors are stored outside the attacker-controlled DB.
- Disaster recovery drills, owner succession, lost-device and lost-factor recovery documented.

---

## 8. Approval workflow and state machine

Statuses:

`DRAFT -> PENDING -> AUTHORIZED -> EXECUTING -> EXECUTED`

Alternative terminal states: `REJECTED`, `EXPIRED`, `CANCELLED`, `FAILED`.

Rules:

1. Requester submits exact immutable action payload; server canonicalizes fields and hashes payload.
2. Server checks requester may propose this action and snapshots current policy / eligible approvers.
3. Each approver proves identity and issues a distinct, replay-resistant decision for the same action digest.
4. Policy evaluates quorum; if Tide-integrated, perform documented cryptographic authorization, and verify proof before execution.
5. Executor re-checks expiry, payload digest, tenant, resource, approver eligibility, and action-specific authorization before execution.
6. Revisions to target/parameters must invalidate existing approvals and create a new request.
7. Consume request exactly once with transaction/lock/idempotency to stop duplicate execution.
8. Record result and audit independently; do not report success before the executor confirms it.

### Example quorum policy

```json
{
    "operation": "REMOVE_OWNER",
    "requiredApprovals": 4,
    "eligibleRole": "OWNER",
    "requesterCanApprove": false,
    "ttlMinutes": 1440,
    "bindToExactPayload": true
}
```

This is a **BusinessVault sample policy schema**, not a documented Tide/Forseti payload.

### Example API routes (application-owned, not Tide APIs)

```text
POST   /api/organizations
GET    /api/organizations/:orgId
POST   /api/organizations/:orgId/invitations
GET    /api/organizations/:orgId/members
POST   /api/organizations/:orgId/requests
GET    /api/organizations/:orgId/requests
GET    /api/organizations/:orgId/requests/:requestId
POST   /api/organizations/:orgId/requests/:requestId/approve
POST   /api/organizations/:orgId/requests/:requestId/reject
POST   /api/organizations/:orgId/requests/:requestId/cancel
POST   /api/organizations/:orgId/requests/:requestId/execute
POST   /api/organizations/:orgId/documents/upload-init
POST   /api/organizations/:orgId/documents/:documentId/commit
GET    /api/organizations/:orgId/documents/:documentId
GET    /api/organizations/:orgId/audit
```

For every API route: authenticated principal, tenant membership verification, input schema validation, least privilege, reasonable rate limits, audit, and CSRF defenses if cookie sessions are used.

---

## 9. Suggested data model (conceptual)

These are application tables, **not** TideCloak internal database schemas.

### Organization
`id, name, createdAt, setupStatus, ownerQuorumPolicyVersion`

### User
`id, tideSubject, displayName, email, createdAt`

### Membership
`id, organizationId, userId, role, status, joinedAt, version`

### Invitation
`id, organizationId, email, invitedRole, invitedBy, tokenHash, expiresAt, acceptedAt`

### Asset
`id, organizationId, type, provider, externalResourceId, name, sensitivity, managedMode, createdAt`

`managedMode`: `INVENTORY_ONLY | API_INTEGRATED | CRYPTOGRAPHICALLY_GATED`.

### Document
`id, organizationId, ownerId, objectKey, ciphertextFormat, encryptionPolicyTag, size, hash, classification, version, createdAt`

### Policy
`id, organizationId, operationType, requiredApprovals, eligibleRoles, forbidSelfApproval, ttlSeconds, version, active`

### ActionRequest
`id, organizationId, requesterId, operationType, targetType, targetId, canonicalPayload, payloadDigest, policyVersion, status, expiresAt, authorizedAt, executedAt, idempotencyKey, version`

### Approval
`id, requestId, approverId, decision, createdAt, policyProofRef, payloadDigest, identitySessionRef`

Add unique `(requestId, approverId)` constraint and verify eligibility at authorization time.

### Execution
`id, requestId, executorType, externalTransactionId, status, attemptedAt, finishedAt, safeErrorCode`

### AuditEvent
`id, organizationId, actorId, action, target, correlationId, eventJson, occurredAt, previousEventHash, eventHash, externalAnchorRef`

Do not treat `previousEventHash` by itself as tamper-proof against DB superusers; verify independent anchors.

**Data modeling requirements:** org scoping on every row, appropriate foreign keys and indexes, optimistic concurrency control, transactions for state changes, and explicit handling of deleted/deactivated users.

---

## 10. Explicit security threat model

### Assets to protect

- Confidential plaintext files and cryptographic release capabilities.
- Organizational ownership and administrator roles.
- Approval legitimacy and integrity.
- Privileged execution credentials.
- Audit records and recovery mechanisms.

### Adversaries

1. External attacker stealing a password or bearer token.
2. Malicious ordinary organization member.
3. Malicious owner or privileged admin acting alone.
4. Database or object-storage attacker.
5. Compromised application server.
6. Compromised browser/device of a legitimate approver.
7. Colluding quorum of approved owners.
8. Malicious or unavailable external provider / insufficient Tide nodes.

### Security objectives and limits

- **One admin cannot change protected BusinessVault ownership alone**, assuming a correctly enforced independent authorization mechanism.
- **Storage compromise does not directly yield E2EE plaintext**, if encryption is implemented correctly and secrets aren't stored with ciphertext.
- **Request parameters cannot change after approval** without invalidation.
- **One request cannot execute twice.**
- **Tenant A cannot access Tenant B's assets.**
- **Approver decisions are attributable, unique, fresh, and authorized.**

Not guaranteed:

- No defense against a colluding sufficient quorum.
- No defense against plaintext theft from an already authorized user's compromised device.
- No universal protection against stolen bearer-token replay.
- No prevention of provider-native actions outside our enforcement boundary.
- No perfect availability or recovery if dependencies fail.
- No guaranteed immunity to compromised Tide nodes, software bugs, policy errors, or weak recovery methods.

### Hardening checklist

- Enforce least privilege and server-side policy on every endpoint.
- Verify JWT issuer, audience, algorithm, signature, expiration, and token purpose.
- Never trust client-side React role checks alone.
- Use HTTPS, secure cookies or validated token handling, CSP, CSRF defenses as applicable.
- Avoid tokens in localStorage when a safer session architecture is feasible; assess XSS and session-replay risks.
- Rate limit authentication-adjacent endpoints and approval submissions.
- Bind approvals to digest + nonce + expiry + organization + exact action target.
- Use database transactions, unique indexes, and idempotent executors.
- Store secrets outside source control and outside general application DB.
- Apply object-storage access limits and retention where needed.
- Minimize PII/metadata and avoid plaintext logs.
- Add alerting for unusually large downloads, repeated failed approvals, and emergency-recovery operations.
- Use supply-chain verification, dependency scanning, and security review before production.

---

## 11. MVP implementation phases

### Phase 0: Capability and architecture validation

Deliver:

- Verified TideCloak version, supported SDK signatures, active auth/login setup.
- Verified documentation for QEA, E2EE roles, doken/session requirements, license activation.
- Proof-of-concept one-file encrypt/decrypt in browser using actual TideCloak SDK.
- Determine whether custom arbitrary action authorization is feasible with Forseti and how to validate a returned proof.
- Clear `SUPPORTED / PARTIAL / NOT VERIFIED / UNSUPPORTED` matrix.

**Exit criterion:** Verified actual auth and E2EE, or documented blocker; no assumed APIs.

### Phase 1: Functional product vertical slice

Deliver:

1. Sign in/out using actual TideCloak.
2. Organization creation and invitation flow.
3. Owner/admin/member role model.
4. An approval request for owner removal with configurable quorum.
5. Approval state machine, request digest, expiry, cancellation, and idempotency.
6. Real backend authorization and audit events.
7. Document upload of ciphertext and client-side authorized decrypt prototype.
8. Dashboard for requests and status.
9. Meaningful unit/integration/E2E tests.

**Critical labeling:** If approvals are only enforced in your app DB and have no cryptographic external guarantee, label them **APP-LEVEL APPROVAL ONLY** in README and demo. Never imply Tide prevented a hacked backend from bypassing them.

### Phase 2: Cryptographically enforced governance

Deliver only after validating actual Tide APIs/policies:

- Tide QEA for supported realm/admin operations.
- Tested Forseti policy or another documented cryptographic authorization path for a protected application operation.
- Action-specific authorization proof verification at final executor.
- Test showing backend DB manipulation does not forge a valid authorization proof.
- Tamper evidence with independent audit anchoring.
- Recovery workflow resistant to single-owner abuse.

If external policy enforcement is not available, publish the limitation and seek a narrow action with documented support rather than simulate this as secure.

### Phase 3: Shared privileged access

- Scoped secret access/release with rotations.
- Owner succession.
- Security alerts and periodic access reviews.
- Protected integrations for GitHub releases and CI/CD where native rules enforce the policy.

### Phase 4: Commercial integrations

- Marketing inventory and supported management API actions.
- Finance: sandbox payments and independent bank/provider-enforced approvals.
- Infrastructure: privileged command gateway and short-lived execution credentials.
- Enterprise SSO, billing, compliance reporting, and usage analytics.

---

## 12. First screens / UX flows

1. **Landing:** Clear promise: “Shared business assets, without a single point of administrative control.”
2. **Onboarding:** Create organization, add co-owners, initialize governance policy, display setup-complete status.
3. **Overview:** Pending critical requests, encrypted files count, ownership health, high-risk assets, recent security events.
4. **My Requests:** Submitted requests and exact parameters; their state and execution outcome.
5. **Approvals:** Requests requiring the signed-in user's attention, rationale, quorum, timeline.
6. **Vault:** Encrypted company documents, tag, sensitivity, allowed users, upload/download/decrypt flows.
7. **Owners & Roles:** Show current membership, protected management actions, pending changes.
8. **Assets:** External assets by category, provider, custodians, current control/enforcement status.
9. **Audit:** Chronological searchable events, differentiating requests, approvals, cryptographic proof checks, executions.
10. **Security Settings:** Quorum and policy management, Tide integration health, backups/recovery warnings.

Accessibility requirements: keyboard controls, clear permission explanations, no color-only status, explicit destructive action confirmations, responsive mobile views.

---

## 13. Acceptance tests / demo scenarios

Write runnable tests for all feasible items below. Record whether Tide cryptographic enforcement was validated separately from ordinary application behavior.

### Basic functionality

- User logs in via TideCloak and can only see their organization.
- Five owners can be invited and accept membership.
- User without privileges cannot propose restricted operations.
- Approval UI lists exactly what is being approved.
- User cannot approve their own request when policy forbids it.
- Two approvals do not satisfy a 3-of-5 policy; three valid approvals do.
- Rejected/cancelled/expired requests cannot execute.
- Request payload mutation invalidates previous approvals.
- Concurrent approval and execution requests are safe from race conditions.

### Security negative tests

- Change `organizationId` in URL: access denied when membership absent.
- Change `targetId` to another tenant's file: access denied.
- Forge an unverified JWT: request denied.
- Reuse expired request or captured approval proof: denied.
- Two requests for same protected action do not execute twice.
- Direct API request bypassing UI approval: denied.
- Deactivate an approver and test pending-vote invalidation according to policy.
- Plaintext isn't stored in PostgreSQL, S3-compatible storage, logs, or server request bodies during E2EE operation.
- Simulate DB modification of status to `AUTHORIZED`: **cannot** produce a valid external cryptographic authorization proof (only claim pass if actually integrated and tested).
- Compromised app server cannot decrypt files **only if** reviewed Tide/client-side E2EE protects against that adversary in the configured deployment; document exceptions.

### User-visible demo

1. Create organization with five owners.
2. Upload and display an encrypted document.
3. Show unauthorized user cannot decrypt.
4. Request to remove a founder.
5. Show failed execution at 1/3 approvals.
6. Show success only after proper quorum for an **appropriately protected** action.
7. Modify database approval row manually and verify whether Tide-backed proof still rejects operation.
8. Inspect audit and execution logs.

**Never stage a fake “server compromised but cryptographically blocked” demonstration using only mutable database flags.**

---

## 14. Production, compliance, and reliability concerns

- Multi-tenant isolation must be reviewed before hosting real customer data.
- E2EE makes support, indexing, previews, anti-malware scanning, and recovery harder; design explicitly.
- File retention can conflict with immediate erasure requests; document retention policy.
- Financial and healthcare data may trigger jurisdiction-specific compliance. No implied regulatory compliance from choosing Tide.
- Owner recovery requires threat modeling (lost password, lost factors, owner death, organizational disputes, court orders).
- Balance quorum strength against business continuity when owners are offline.
- Document operation latency and network availability effects of distributed cryptography.
- Validate Tide licensing, deployment terms, operational dependencies, and independent security claims before launch.
- Do not promise arbitrary third-party admin restrictions without provider-enforced support.
- Preserve backups, disaster recovery, audit integrity, observability, and key-rotation processes.

---

## 15. Competitor and differentiation hypotheses

Potential adjacent categories:

- Password/secrets managers (e.g., 1Password), identity access management (e.g., Keycloak, Microsoft Entra), compliance/audit tools, document vaults, multi-signature wallets, privileged access management, and financial approval tools.

**Proposed differentiator:** an organization-centric governance layer that links critical assets to enforceable multi-person authorization and cryptographic access, minimizing the risk of one privileged account controlling shared property.

**Do not claim market novelty or product-market fit without research.** Validate demand, buyer persona, economic loss, willingness to pay, existing alternatives, and integration feasibility through customer interviews.

Suggested interviews:

- 5 startup founders with 2+ cofounders.
- 5 small agencies administering client accounts.
- 5 engineering leads/security operators managing shared infrastructure.
- 5 people who experienced privileged-account lockout/ownership disputes.

Questions: Which assets could one person destroy or seize? What controls exist? Have they been bypassed? How often? How expensive was recovery? Who would approve a new governance system? Could they restrict native platform permissions?

---

## 16. Open questions that Codex must resolve or explicitly surface

1. Current TideCloak SDK versions and complete TypeScript signatures for authentication and E2EE.
2. Whether Tide provides a supported programmable-policy API for **arbitrary application operations**, and whether its output is externally verifiable.
3. How to implement quorum policies for application actions distinct from Tide realm administrative QEA.
4. Which E2EE roles/tags are appropriate to document classes and organizational membership; handling of permission revocation and already-decrypted copies.
5. Large-file encryption pattern and limits; whether envelope encryption/key wrapping is compatible with current Tide APIs.
6. Admin bootstrap, multi-owner onboarding, and emergency recovery without a unilateral super-admin bypass.
7. Multi-tenant Tide realm topology: shared versus per-organization realms, isolation, quotas, licensing, and provisioning.
8. Exact token/session storage model, CORS, CSRF, callback routes, and frontend/backend trust boundary.
9. Independent audit anchoring and reliable action execution.
10. Third-party platform API support for enforcing policy instead of merely displaying approvals.

If blocked, implement the **narrowest verified feature** and document the limitation rather than creating an insecure imitation.

---

## 17. Definition of done for the first Codex delivery

- [ ] Working Next.js app with documented setup.
- [ ] Database schema and migration.
- [ ] Real TideCloak login flow or a clearly stated integration blocker.
- [ ] Organization and membership model with tenant isolation.
- [ ] Protected action request with quorum workflow and immutable canonical payload.
- [ ] Authorized encrypted document round-trip in browser, if current Tide setup supports it.
- [ ] UI screens for dashboard, vault, approvals, members, and audit.
- [ ] Unit, integration, and relevant browser tests.
- [ ] `.env.example` containing names only, no real credentials.
- [ ] Threat model and honest feature-status matrix.
- [ ] No broad wildcard permissions or fake security guarantees.
- [ ] Summary of implemented features, tested guarantees, and unresolved work.

## 18. One-paragraph product pitch

**BusinessVault is a digital asset governance platform for businesses where multiple people share ownership. It combines identity management, encrypted company data, administrator governance, approval workflows, and an inventory of external business assets. Built on TideCloak's decentralized cryptographic infrastructure where feasible, it aims to prevent any single employee, founder, or compromised admin account from unilaterally taking over or exposing the organization's most valuable resources. Unlike a generic approval dashboard, its ultimate goal is to enforce critical policies at the cryptographic or execution layer, while clearly disclosing which external services cannot support those guarantees.**

## 19. References

### Official Tide material

- https://docs.tide.org/
- https://docs.tide.org/FAQ/
- https://docs.tide.org/Core-Concepts/core-concepts
- https://docs.tide.org/Core-Concepts/forseti-engine
- https://docs.tide.org/Admin/e2ee
- https://docs.tide.org/Languages/NextJS/tidecloak-nextjs-intro
- https://docs.tide.org/Languages/NextJS/tidecloak-nextjs-discussion
- https://github.com/tide-foundation/tidecloak-gettingstarted
- https://github.com/tide-foundation

### Reference technologies

- https://www.keycloak.org/documentation
- https://nextjs.org/docs
- https://www.prisma.io/docs
- https://www.postgresql.org/docs/
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html

### Verification note

Tide's own documentation describes the platform's expected security properties. Do not treat marketing or design claims as a substitute for tested implementation, formal review, or third-party audits. No comprehensive existing production-grade BusinessVault equivalent built with TideCloak was verified when writing this specification.
