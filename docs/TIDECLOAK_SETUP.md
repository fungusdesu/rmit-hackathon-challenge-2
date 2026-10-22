# TideCloak setup and validation

The repository declares `@tidecloak/nextjs` `^0.14.40`. `TideCloakProvider`, `useTideCloak`, `createTideCloakProxy`, and `verifyTideCloakToken` are wired in source. The local handoff reports a development realm named `nextjs-test` and client `myclient`, but this snapshot does **not** establish a successful browser login or encryption round trip.

## Development setup

1. Run the TideCloak development server using the [official quickstart](https://docs.tide.org/get-started/Tidecloak%20Quickstart). Keep its database and generated adapter files local and ignored.
2. Confirm a Tide-enabled realm, Tide identity provider, valid development license, QEA, and enrolled `tide-realm-admin` in the Tide console. The [license guide](https://docs.tide.org/Admin/license) describes the initial free-tier license and where to inspect it.
3. Register an OIDC app/client and authorize its callback URL and web origin. The [Next.js guide](https://docs.tide.org/Languages/NextJS/tidecloak-nextjs-intro) covers provider, callback, route protection, and token verification.
4. Copy `.env.example` to a local ignored environment file and replace placeholders with the realm's public URL, realm name, client ID, and callback. Keep credentials out of source control. `NEXT_PUBLIC_*` values are embedded at build time.
5. For the existing local realm, run the application directly with `npm run dev` and visit `/auth/login`. The local Docker app uses development auth by default; `localhost:8080` inside its container does not identify the host Tide server. Validate redirect, login, callback, logout, then API token claims.

Expected variable names: `AUTH_MODE`, `NEXT_PUBLIC_AUTH_MODE`, `TIDECLOAK_AUTH_SERVER_URL`, `TIDECLOAK_REALM`, `TIDECLOAK_CLIENT_ID`, `NEXT_PUBLIC_TIDECLOAK_AUTH_SERVER_URL`, `NEXT_PUBLIC_TIDECLOAK_REALM`, `NEXT_PUBLIC_TIDECLOAK_CLIENT_ID`, and `NEXT_PUBLIC_TIDECLOAK_REDIRECT_URI`. `DATABASE_URL` remains required for Prisma.

## Encryption and policy checkpoints

Tide's [E2EE setup guide](https://docs.tide.org/Admin/e2ee) requires a licensed Tide realm with QEA, appropriate `_tide_<tag>.selfencrypt` and `_tide_<tag>.selfdecrypt` roles, and an authenticated browser session. The Next.js SDK exposes `doEncrypt` and `doDecrypt` through `useTideCloak()`. First test a small string or `Uint8Array` and verify that an unauthorized user cannot decrypt it. Do not assume a large-file workflow from this small-data API.

The [Forseti guide](https://docs.tide.org/Core-Concepts/forseti-engine) describes programmable C# policy contracts and request validation. It does not by itself prove that this application has deployed a contract, received a BusinessVault-specific proof, or verifies it at the final executor. Record supported request/proof types, deployment and licensing conditions before making that claim.

Current status: SDK boundary is in code; realm provisioning is reported in the handoff; live login, token-claim tests, browser E2EE, arbitrary-action Forseti proof, and independent executor verification remain **unverified**.
