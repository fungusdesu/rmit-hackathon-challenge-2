# Security model

BusinessVault protects organization membership, approval integrity, confidential documents, privileged integrations, and recovery authority. The browser, application server, database, object store, Tide network, and each external provider are separate trust boundaries.

## Current enforcement

Server routes authenticate a principal, check active organization membership, and scope organization data. The `REMOVE_OWNER` workflow uses canonical request payloads, a digest, policy snapshot, distinct approvers, expiry, idempotency, transactions, and audit rows. This is **APP-LEVEL APPROVAL ONLY**. A database owner or compromised application server can potentially alter its own state or bypass application controls. Audit rows in the same database are not independently tamper-proof.

The default Docker profile enables a development identity adapter. It must never be exposed as production authentication. Tide mode has a provider, proxy, and server token verification call, but live realm login and claim behavior still need tests. Browser role checks are presentation only; server checks remain mandatory.

## Threats and required defenses

| Threat | Current or planned defense | Remaining limit |
| --- | --- | --- |
| Cross-tenant access | Server membership checks and organization-scoped queries | Add automated IDOR tests on every new endpoint. |
| Forged or replayed identity | Tide verification boundary in Tide mode | Verify live issuer/audience/expiry behavior and session handling. |
| Single owner changing protected state | Application approval workflow for `REMOVE_OWNER` | No independently enforced cryptographic proof at executor. |
| Duplicate or mutated request | Canonical digest, idempotency key and transactional claim | Test concurrent calls and direct API bypass. |
| Database or object-store theft | Planned browser-side E2EE and ciphertext-only storage | Document storage and decryption are not implemented. |
| Compromised approver device | Authenticated approval session | Cannot guarantee safety of plaintext already viewed on that device. |
| Privileged external provider user | Future scoped execution gateway and provider-native controls | Native super-admin paths may bypass BusinessVault. |
| Owner lockout | Planned governed recovery with trustees | Recovery workflow is not implemented. |

Approval UI must show exact action parameters, target, requester, expiry, and the enforcement label before consent. A policy change or request edit must never silently reuse prior approvals. AI recommendations may explain or prepare actions but must not be allowed to approve or execute protected changes independently.

Before production: validate real Tide login and encryption; add negative tests for forged tokens, tenant isolation, self-approval, replay, expiry, payload mutation, direct API bypass, and concurrency; define independent audit anchoring and recovery. Do not claim that Tide QEA for realm administration automatically protects arbitrary application actions.
