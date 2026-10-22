# Tide E2EE Verification Record

## Environment

- TideCloak: `tideorg/tidecloak-dev:latest` (image created 2026-10-19), local container on `localhost:8080`.
- SDK: `@tidecloak/nextjs@0.14.40` → `@tidecloak/js@0.14.34`, `@tidecloak/react@0.14.33`.
- Provisioning: vendor `@tidecloak/create-nextjs@0.14.33` `init/tcinit.sh`, extended (in ignored `tidecloak-setup/init/tcinit-vault.sh`) to create the realm roles `_tide_vault.selfencrypt` / `_tide_vault.selfdecrypt` and the test users `bob` (vault roles) and `mallory` (no vault roles) while the realm is still in firstAdmin mode. The enrolled `admin` user also gets both vault roles and plays "alice".

## Provisioning attempts (2026-10-22, local time UTC+7)

| Realm | Started | Result |
|---|---|---|
| `nextjs-test` | 13:44 | `setUpTideRealm` HTTP 500 `TIDE-IDPEXT-VENDOR-KEYGEN_FAILED`; log: `Midgard.FinalizeWallet: Not enough orks returned an ok response` (ORK request timed out after 100 s) |
| `businessvault` | 13:47 | Same error code; log: `FinalizeWallet: Response status code does not indicate success: 500` |
| `bv2` | 13:51 | Same |
| `bv3`–`bv8` | 13:54–14:03 | Same |
| **`bv9`** | 14:04 | **Succeeded**: vendor key and licence set up, IGA enabled, admin user created |

The failures happen on Tide's network at the free-tier licence finalization step, after
the vendor key is created. `https://ork1.tideprotocol.com/` itself answered HTTP 200 in
under 1 s, so basic connectivity is fine.

## Realm `bv9` setup (after licence)

| Step | Result |
|---|---|
| Admin Tide enrollment, 1st attempt | Failed: `CUSTOM_REQUIRED_ACTION_ERROR`, `error="expired_code"` (default 300 s user-action lifespan elapsed during Tide sign-up). Raised `accessCodeLifespanUserAction` to 1800 s |
| Admin Tide enrollment, 2nd attempt | **Succeeded** (15:07): `tideUserKey` and `vuid` set |
| Vault roles | `_tide_vault.selfencrypt` and `_tide_vault.selfdecrypt` created. A single role-mapping request with both roles only committed the first one under IGA, so `selfdecrypt` was granted separately. Final: admin and bob have both; mallory has none |
| bob enrollment | **Failed on Tide's network**: `TIDE-IDPEXT-IDP-IDENTITY_ATTESTATION_SIGN_FAILED`, log `Midgard.SignModel: Not enough orks returned an ok response` (one ORK returned 400). A sign-in reusing the admin's Tide account was refused with `TIDE-IDPEXT-VOUCHER-SESSION_NOT_FOUND` |
| mallory enrollment | Not attempted (time) |
| IdP settings | `CustomAdminUIDomain` set; `sign-idp-settings` → 200 "signed successfully" |
| Adapter | Generated with `vendorId`, `homeOrkUrl`, `jwk`, `client-origin-auth-http://localhost:3000`, etc.; written to ignored `.env.local` via `scripts/vault/tide-env.mjs bv9` |
| App in Tide mode | `/auth/login` serves "Continue with TideCloak"; clicking it reaches Tide's sign-in (`ork1.tideprotocol.com`) with signed settings and `vRedirectUri=http://localhost:8080/realms/bv9/broker/tide/endpoint` |
| Realm mode | Still firstAdmin (the multiAdmin flip and `tide-realm-admin` grant were not run), so further role/user changes stay auto-approvable for local testing |

## Test matrix

Run on `/dashboard/vault/diagnostics` and `/dashboard/vault` with `AUTH_MODE=tidecloak`. "alice" is the enrolled bv9 `admin`.

| # | Actor | Action | Expected | Result |
|---|---|---|---|---|
| 1 | alice (roles) | encrypt + decrypt short string | success | NOT RUN: the presenter's login attempt failed before the deadline (cause not captured) |
| 2 | alice | 1 MiB and 5 MiB round-trip, record latency and output types | success, timings recorded | NOT RUN |
| 3 | bob (roles) | decrypt ciphertext exported by alice | unknown; determines whether self-decrypt is uploader-bound | BLOCKED: bob enrollment failed on Tide's network |
| 4 | mallory (no roles) | encrypt | denied by Tide | BLOCKED: mallory not enrolled |
| 5 | mallory | decrypt alice's ciphertext | denied by Tide | BLOCKED |
| 6 | alice | vault upload, then `leak-scan.ts <canary>` | PASS on Postgres, MinIO, logs | NOT RUN in Tide mode (PASS in development mode with the demo cipher) |
| 7 | server | `VAULT_IT_TIDE=1` suite: no token / forged / `alg:none` → 401; demo format → 400 | pass | **PASS 3/3** (the demo-format case needs a real token and was skipped). Dev headers are ignored in Tide mode (401) |

## Conclusion

- **Verified against the real Tide realm `bv9`:** realm licensing and vault role/tag provisioning, admin enrollment, a signed IdP, the generated adapter, the app's Tide-mode auth boundary (unauthenticated, forged and `alg:none` tokens rejected, dev headers ignored), and a correct redirect to Tide sign-in.
- **NOT VERIFIED:** a live `doEncrypt`/`doDecrypt` round trip, cross-user decrypt behaviour, and no-role denial. These need a successful Tide login, plus bob and mallory enrollments once Tide's network accepts them.
- No claim of server-compromise protection is made.

To resume: run `npm run dev` with the existing `.env.local` (realm `bv9`), log in at `/auth/login` as the enrolled admin, run `/dashboard/vault/diagnostics`, and paste the "Copy results as Markdown" output into this file.
