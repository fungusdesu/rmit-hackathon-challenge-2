# Organization-Shared Decryption with Tide — Feasibility

Status: **BLOCKED / NOT VERIFIED**. Nothing in this document is implemented. The vault ships
**uploader-only decrypt** (see `PLAN.md` §0, `STATUS.md` "Shared org decryption: BLOCKED").

Labels used below:
- **VERIFIED (source)**: read directly in the installed SDK (`@tidecloak/js@0.14.34`,
  `@tidecloak/react@0.14.33`) or on `docs.tide.org`, on 2026-10-22.
- **ASSUMPTION**: inference that a live test or Tide has to confirm.

Docs read: `https://docs.tide.org/Admin/e2ee`, `https://docs.tide.org/Core-Concepts/forseti-engine`,
`node_modules/@tidecloak/js/lib/README.md` ("Encryption", "Policy-Protected Encryption"),
`node_modules/@tidecloak/js/dist/types/IAMService.d.ts`, `dist/types/lib/tidecloak.d.ts`,
`node_modules/@tidecloak/react/dist/types/contexts/TideCloakContextProvider.d.ts`.

## 1. What `_tide_<tag>.selfencrypt` / `selfdecrypt` implies

| Claim | Label |
|---|---|
| Encrypt for tag `T` requires realm role `_tide_T.selfencrypt`; decrypt requires `_tide_T.selfdecrypt`. | VERIFIED (e2ee docs; js README) |
| Data with several tags needs the roles for every tag. | VERIFIED (js README "Encryption") |
| The e2ee guide adds both roles to the realm's default roles, so every user gets them. Creating the roles and changing the default roles goes through QEA change requests. | VERIFIED (e2ee docs) |
| The docs never say whether user B (who holds `_tide_vault.selfdecrypt`) can decrypt ciphertext that user A produced. Every example has the same user encrypting and decrypting. | VERIFIED (e2ee docs; README examples) |
| The word "self" suggests the key is bound to the encrypting user, so B **cannot** decrypt A's data. | **ASSUMPTION** |
| The opposite reading, that the key is per-tag across the realm so any holder of the role can decrypt, is equally consistent with the text. | **ASSUMPTION** |

**Decider:** row 3 of `TIDE_E2EE_VERIFICATION.md` (bob decrypts alice's exported ciphertext,
using the paste test on `/dashboard/vault/diagnostics`). Until a realm provisions, it is
pending. Today every provisioning attempt fails with `TIDE-IDPEXT-VENDOR-KEYGEN_FAILED`.

- If row 3 **succeeds**, sharing is "every realm user with the vault role". That is **realm-wide,
  not per organization**: bob can decrypt any org's `vault` ciphertext he obtains. The only
  remaining protection is our server, which refuses to hand out ciphertext to non-members. That
  is weaker than per-org E2EE and must be stated. A per-org tag (`vault_<orgId>`) would need one
  realm role pair per org, created through QEA. **ASSUMPTION** that this scales operationally.
- If row 3 **fails**, decrypt is uploader-bound. That matches the shipped decision, and sharing
  needs the policy mechanism in §2.

## 2. Policy-protected encryption

| Claim | Label |
|---|---|
| Encryption and decryption can be governed by a "Tide Policy + Forseti Contract". Policy-creation docs are marked *coming soon*. | VERIFIED (js README "Policy-Protected Encryption") |
| **Inline policy:** `doEncrypt(data, policy)` / `doDecrypt(data, policy)` with `policy: Uint8Array`. The ORKs enforce it, the realm-role tag checks are **skipped**, and there is no separate approval step. | VERIFIED (README; `IAMService.d.ts` `decryption_policy?: Uint8Array`; React context `doEncrypt(data, decryptionPolicy?)`) |
| Native mode throws if a policy is passed. Hybrid mode does not support `doEncrypt`/`doDecrypt` at all. | VERIFIED (`IAMService.d.ts` JSDoc) |
| **Approval flow:** `doDraftEncryption([{data: Uint8Array, tags}]) → Uint8Array`, then `requestTideOperatorApproval([{id, request}]) → {id, request, status: "approved"/"denied"/"pending"}[]`, then `doCommitEncryption(approvedRequest, policy) → Uint8Array[]`. Decrypt mirrors this with `doDraftDecryption` / `doCommitDecryption`. Draft input must be `Uint8Array`. | VERIFIED (README; `IAMService.d.ts`; `tidecloak.d.ts`) |
| Draft/commit is not available in hybrid or native mode, so it is front-channel only. | VERIFIED (`IAMService.d.ts`) |
| The React context exposes `doEncrypt`, `doDecrypt`, `initializeTideRequest`, `executeTideRequest` and `approveTideRequests`. It does **not** expose `doDraftEncryption`/`doCommitEncryption`; those live on `IAMService` / the `TideCloak` class. | VERIFIED (`TideCloakContextProvider.d.ts`) |
| The README says the approval flow is for custom Forseti contracts with multi-party approval requirements, approved by "Tide operators". | VERIFIED (README) |
| Who counts as a "Tide operator" for an app's users, and whether our org owners can be operators. | **ASSUMPTION / unknown** |

### What a "signed policy" is

| Claim | Label |
|---|---|
| To the SDK, a policy is an opaque `Uint8Array`. It has no documented schema or builder in the installed packages. | VERIFIED (types) |
| Forseti contracts are C# (.NET) classes implementing `IAccessPolicy`. They validate request data, approvers (M-of-N `EXPLICIT` policies check approver dokens) and executor roles. If the contract fails, the ORKs will not produce the signatures. | VERIFIED (forseti-engine docs) |
| A contract's ID is a SHA-512 hash of its C# source. Policies are attested and committed to the network. Admin-rule changes need endorsement from a threshold of nominated admins (the page says 70%, minimum 1) using their Tide keys. | VERIFIED (forseti-engine docs) |
| The `Uint8Array` "signed policy" is the admin-endorsed policy blob that references a contract ID and its parameters. | **ASSUMPTION** (docs "coming soon") |
| How a vendor app produces or obtains that blob (admin console, API, SDK). | **unknown** |

## 3. Can a quorum (3-of-5 owners) gate decrypt or export?

Spec §3 "Confidential documents" wants export/decrypt to need 3-of-5 owners or data stewards.

- Forseti `EXPLICIT` policies verify M-of-N approver dokens before the nodes act, and the docs
  list decryption among governed actions. **VERIFIED (forseti-engine docs)**, at concept level only.
  The page does not give a concrete decrypt-policy flow.
- So it is *plausible* that a policy could require 3 of 5 named owners' approvals before an
  ORK releases the decryption. **ASSUMPTION.**
- The SDK's approval step is `requestTideOperatorApproval`. Whether it gathers approvals from
  *our org owners* (each signing in their own browser) or from realm admins only is not documented.
  **ASSUMPTION / unknown.**
- "Export" of ciphertext is a server action (presigned GET). Tide cannot gate it. The server can
  gate it with our own ActionRequest quorum, but that is **not cryptographic**: a DB-flag edit
  would bypass it (spec §13 forbids presenting this as cryptographic).

## 4. Questions to ask Tide

1. Is `_tide_<tag>.selfdecrypt` bound to the encrypting user, or does it work for any holder of the role in the realm?
2. How is a decryption policy (`Uint8Array`) created, signed and distributed? Is there an admin-console flow, a REST API or an SDK builder? When will the "Policy Creation Guide" ship?
3. Can a Forseti `EXPLICIT` contract require M-of-N approvals from realm *users* (our owners), and how do those users approve — through `requestTideOperatorApproval` or `approveTideRequests`?
4. Can a policy be parameterised per organization (for example `orgId` in the request data) so one contract serves many tenants?
5. Is the ciphertext bound to the policy at encrypt time, and can the policy be rotated or revoked without re-encrypting?
6. Is the commit output (signatures) verifiable by a relying server, and with which public key?
7. What are the maximum payload size and the latency for `doEncrypt` / `doCommitEncryption`? This matters for `LARGE_FILES_DESIGN.md`.
8. Licensing: are Forseti custom contracts available on the free/dev tier?

## 5. Integration sketch for BusinessVault (NOT IMPLEMENTED)

This sketch plugs into the existing approval module `lib/approvals.ts` (`PROTECTED_OPERATIONS`,
`createActionRequest`, `recordApproval`, `executeActionRequest`, `digestPayload`, `appendAudit`).

1. **Encrypt (uploader):** `doEncrypt([{data: bytes, tags:["vault"]}], orgPolicy)`, where
   `orgPolicy` is the org's signed policy, fetched as public data from a new
   `Policy` row (`model Policy` already exists in the schema). The ciphertext format becomes
   something like `tide-policy-v1`. The upload path is unchanged otherwise.
2. **Request release:** a member creates an ActionRequest with a new operation
   `DECRYPT_DOCUMENT { documentId, version, hash }`. The existing digest and canonical payload
   bind approvals to that exact document version.
3. **Approve:** each owner approves in the app (`recordApproval`). *If* Tide allows it, each
   owner also approves the Tide draft in their own browser (`approveTideRequests` /
   `requestTideOperatorApproval`), so the quorum is enforced by ORKs, not just by our DB.
4. **Execute:** the requester's browser calls `doDraftDecryption` → approvals →
   `doCommitDecryption(approved, orgPolicy)`. The server's `executeActionRequest` only issues
   the presigned GET for the ciphertext and records audit.

| The server CAN enforce | The server CANNOT enforce |
|---|---|
| Membership and role checks; 404 for non-members | Whether a holder of ciphertext + Tide roles decrypts it (only Tide can) |
| Ciphertext download needs AUTHORIZED ActionRequest | Cryptographic quorum — a DB edit to `AUTHORIZED` bypasses the app-level check |
| Audit of request, approvals and download issuance | Revoking plaintext already decrypted on a device |
| Binding approvals to `documentId` + version + hash | That approvers in the Tide flow are the same people as in the app |

## 6. What is blocked and why

| Item | Blocker |
|---|---|
| Deciding whether `selfdecrypt` is uploader-bound | The realm will not provision (`TIDE-IDPEXT-VENDOR-KEYGEN_FAILED`), so row 3 cannot run |
| Inline policy encryption | No documented way to create or sign a policy ("coming soon") |
| Draft/approve/commit quorum decrypt | Same as above, plus unknown operator/approver model and C# contract deployment |
| Cryptographic gating of ciphertext export | Not a Tide feature; the app-level gate is non-cryptographic |
| Per-org isolation with plain tags | Would need a role pair per org via QEA; untested |

Until these clear, the honest claim is: **uploader-only decrypt, server-enforced org access to
ciphertext, no cryptographic sharing or quorum release.**
