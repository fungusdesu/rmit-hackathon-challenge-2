# Implementation plan

## Current assessment

The foundation runs, and the first organization and owner-removal APIs exist. The main gap for a credible product demo is a real UI over those APIs, live Tide login validation, and security tests. See [status](./PROJECT_STATUS.md) for a feature matrix.

## Parallel tracks

| Developer | Immediate independent task | Completion check |
| --- | --- | --- |
| 1 — Identity | Verify browser TideCloak login/logout, server claims, and user sync with the local realm. Record the exact E2EE method signatures and prerequisites. | A real token passes server verification; invalid or expired tokens fail; no changes to dev auth assumptions without proof. |
| 2 — Governance | Add invitation lifecycle and security tests for existing owner-removal requests. Propose policy management contract. | Expiry/revocation and tenant isolation tested; self-approval, replay, payload mutation, and concurrent execution covered. |
| 3 — Services and AI | Define ciphertext-only document API and storage contract; verify browser encryption round trip with Developer 1 before uploading files. Sketch restricted AI tool interface using demo records. | No plaintext reaches application APIs or object storage; unsupported integrations remain disabled. |
| 4 — Frontend and UX | Replace dashboard sample values with organization and summary API data. Add organization empty/create flow and request list/detail with exact payload and enforcement label. | Loading/error/empty/unauthorized states, responsive layout, keyboard controls, and browser checks. |

## Sequence

1. **Synchronize the project:** inventory the code and document status, architecture, Tide setup, and security boundaries. Keep `.env.example` placeholder-only.
2. **Make the existing slice usable:** connect the dashboard to current APIs; show actual organizations, requests and statuses. Avoid placeholder claims.
3. **Complete identity and governance:** verify Tide sessions; implement invitation and policy lifecycle with negative tests. Frontend consumes the stable response shapes.
4. **Prove encrypted documents:** validate Tide E2EE in the browser, then implement ciphertext-only upload and retrieval. Add vault UI after the contract is stable.
5. **Investigate independent enforcement:** evaluate documented Forseti support, proof transport, binding, verification, and licensing. Retain `APP-LEVEL APPROVAL ONLY` until an executor verifies a real action-specific proof.
6. **Expand carefully:** audit viewer, recovery design, asset inventory, then AI tools and external provider sandboxes.

Each track should use its owned files and agree on shared API types before changing a route or migration. A new UI should never imply that a future backend endpoint already exists.
