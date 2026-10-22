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
| `bv3` | 13:54 | Same |

The failure happens on Tide's network at the free-tier licence finalization step, after
the vendor key is created. `https://ork1.tideprotocol.com/` itself answered HTTP 200 in
under 1 s, so basic connectivity is fine. Retries run automatically until 15:15.

## Test matrix (to run once a realm provisions)

Run on `/dashboard/vault/diagnostics` and `/dashboard/vault` with `AUTH_MODE=tidecloak`.

| # | Actor | Action | Expected | Result |
|---|---|---|---|---|
| 1 | alice (roles) | encrypt + decrypt short string | success | pending |
| 2 | alice | 1 MiB and 5 MiB round-trip, record latency and output types | success, timings recorded | pending |
| 3 | bob (roles) | decrypt ciphertext exported by alice | unknown; determines whether self-decrypt is uploader-bound | pending |
| 4 | mallory (no roles) | encrypt | denied by Tide | pending |
| 5 | mallory | decrypt alice's ciphertext | denied by Tide | pending |
| 6 | alice | vault upload, then `leak-scan.ts <canary>` | PASS on Postgres, MinIO, logs | pending |
| 7 | server | `VAULT_IT_TIDE=1` suite: no token / forged / `alg:none` → 401; demo format → 400 | pass | pending |

## Conclusion so far

Tide E2EE is **NOT VERIFIED** in this deployment. The vault code path uses the documented
SDK signatures, but no live encrypt/decrypt has run against a provisioned realm because
realm provisioning is blocked by Tide network errors. No claim of server-compromise
protection is made.
