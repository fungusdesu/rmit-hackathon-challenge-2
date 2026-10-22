# Where TideCloak fits: plan and simulation

Built with Tide's MCP (Raziel, `@tideorg/mcp` v1.9.33, `https://mcp.tide.org/mcp`) on 2026-10-22. Sources:
- `tide_choose_scenario`: closest matches were **organisation-password-manager** and **iga-admin-governance**;
- `tide_scenario_roles` for both;
- playbooks `protect-api-nextjs`, `add-rbac-nextjs` and `verify-jwt-server-side`;
- canon `invariants` (I-03, I-04, I-08, I-10) and `anti-patterns` (AP-02, AP-18, AP-24).

## Run it

```bash
npm run dev:sim          # AUTH_MODE=tidecloak-sim; open http://localhost:3000/auth/login
npm run seed:demo        # signs in each persona through the simulated realm
```

Live realm instead: `AUTH_MODE=tidecloak` + `NEXT_PUBLIC_AUTH_MODE=tidecloak` with your `tidecloak.json` (CONTINUE_MINHKY.md §3). No app code changes.

## Where TideCloak sits in each layer

| Layer | With a live Tide realm | In the simulation (`tidecloak-sim`) | Code |
|---|---|---|---|
| Sign-in | Tide enclave login (threshold auth, no password held anywhere). The SDK sets the `kcToken` cookie. | Account chooser at `/auth/login`. `POST /api/auth/sim` issues a signed token and sets the same `kcToken` cookie (httpOnly). | `app/auth/login`, `app/api/auth/sim`, `lib/auth/sim/*` |
| Token | EdDSA JWT from the realm: `iss`, `azp`, `sub`, `realm_access`, `resource_access`, `email_verified`. | Same claims, EdDSA-signed by a local key (`.tidecloak-sim/`, gitignored). | `lib/auth/sim/issuer.ts` |
| Verification (I-03, I-04) | `verifyTideCloakToken` against the **embedded JWKS** in the adapter config. No remote JWKS. Checks issuer, `azp`, algorithm and expiry. | **The same function and checks**, with the simulated adapter config. Only the signing key differs. | `lib/auth/server.ts` `requirePrincipal`, `activeTideConfig` |
| Route gating | `createTideCloakProxy` redirects pages to `/auth/login` and returns 401/403 for APIs. | `proxy.ts` verifies `kcToken` the same way. Route handlers verify again (I-08: gating is not authorization). | `proxy.ts` |
| Gate role | `_tide_enabled` (default-roles composite in realm.json). | Same. Victor has no roles, so every API returns 403. Disable with `TIDE_REQUIRED_ROLE=""`. | `requirePrincipal` |
| Vault E2EE roles | `_tide_vault.selfencrypt` / `.selfdecrypt`: the Tide fabric refuses encrypt/decrypt without them. | Server refuses `upload-init` / `download` without them (403). Erin can't upload; Mallory has no vault roles. The cipher is the local demo cipher, which is **not E2EE**. | `requireTideRole` in the document routes |
| Org roles (OWNER/ADMIN/MEMBER/AUDITOR) | App database, scoped per organization. | Same. | `lib/organizations.ts` |
| Privileged changes | App-level quorum approvals (APP-LEVEL APPROVAL ONLY). | Same. | `lib/approvals.ts` |
| Same-origin mutations | Cookie-authenticated POST/PATCH/DELETE need `Origin` = `APP_ORIGIN`. Bearer is exempt. | Same. | `requireTrustedOrigin` |

Simulated realm users (`lib/auth/sim/realm.ts`). Subjects match `seed-demo`.

| Account | Realm roles | Shows |
|---|---|---|
| alice, bob, carol (owners); dave (member) | `_tide_enabled`, `_tide_vault.selfencrypt`, `_tide_vault.selfdecrypt` | Normal use |
| erin (auditor) | `_tide_enabled`, `_tide_vault.selfdecrypt` | Upload refused: no encrypt role |
| mallory (outsider) | `_tide_enabled` | Not an org member (404), no vault roles (403) |
| victor | none | Every API returns 403: not Tide-enabled |

## What the simulation does NOT prove

- **No threshold cryptography or enclave.** A local key signs the tokens, so a stolen key forges any user. Only the token shape and the server's checks match a live realm.
- **Vault files are not end-to-end encrypted** in this mode. Use the live realm for the E2EE claim (docs/vault/TIDE_E2EE_VERIFICATION.md).
- **No IGA.** Realm role changes go through quorum change requests in a real realm (I-10). Here they're a code edit.
- **No DPoP** (I-12) and no silent token refresh. Simulated tokens last 60 minutes, then you sign in again.
- **Never enable it in production:** it requires `ALLOW_INSECURE_DEV_AUTH=true`, and `/api/auth/sim` returns 404 otherwise.

## Next steps toward Tide-native (from the Tide scenarios)

1. **Org roles as TideCloak client roles** (organisation-password-manager): `org:{uuid}:owner|admin|user`, created by the app and granted through **IGA change requests**. API checks would then read `resource_access[client].roles` instead of the DB alone. Keep `_tide_*` roles separate from app roles (AP-18).
2. **Back app approvals with IGA/Forseti** (iga-admin-governance): an approved CHANGE_PRIVILEGED_MEMBERSHIP becomes a change request whose commit needs the realm quorum `max(1, floor(admins × 0.7))`. That removes the "app-level only" caveat. Don't proxy governed approvals through our server (AP-89).
3. **Shared vaults:** self-encryption is user-bound (AP-24). Sharing needs `_tide_encryptor`/`_tide_decryptor` plus `RelationshipAttestation:1` policies per vault (docs/vault/SHARED_DECRYPT.md).
4. **DPoP + `tide_dpop_auth.html`** when moving to a DPoP realm (`tide_dpop_asset`). Run `tide_doctor` on the live app.
5. **Realm setup** needs the user's licence email and acceptance of Tide's terms (https://tide.org/legal). Only the user can agree.
