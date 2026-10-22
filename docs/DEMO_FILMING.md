# Filming the BusinessVault Demo (≈5 minutes)

Development mode, on Windows or Linux. Every step below is verified to work on 2026-10-22.

## Setup (2 minutes, before recording)

1. Services: `docker compose up -d postgres minio`, then `npx prisma migrate deploy`.
2. Start the app in development auth mode:
   - Bash: `AUTH_MODE=development NEXT_PUBLIC_AUTH_MODE=development ALLOW_INSECURE_DEV_AUTH=true DEV_AUTH_SUBJECT=local-owner npm run dev`
   - PowerShell: set those four variables with `$env:NAME="value"` first, then `npm run dev`.
   - If `.env.local` is in Tide mode, rename it while filming the dev-mode demo.
3. Seed clean data: `npm run seed:demo`. This creates **Northstar Labs (demo)** with:
   - 3 owners (Alice, Bob, Carol), so governance is ACTIVE;
   - Dave as member and Erin as auditor;
   - 3 assets (one CRITICAL);
   - Bob's pending request to invite Frank as ADMIN.
4. Open http://localhost:3000/dashboard. Use **"DEV · acting as"** in the top-right header to switch people.

## Script

| # | Act as | Do | Say |
|---|---|---|---|
| 1 | Alice | **Overview**: metrics, "needs your attention" | "Five people share this company. No single admin controls it." |
| 2 | Alice | **Members & owners**: 3 owners, the quorum callout | "Removing an owner or adding an admin needs other owners to approve." |
| 3 | Bob | **Approvals inbox**: his own request shows "you can't approve your own request" | "Bob asked to add Frank as admin. He can request, but he can't approve it himself." |
| 4 | Alice | **Approvals**: open the request; show the exact payload, digest, quorum 0/2. Click **Approve exact request** and confirm | "Approvers sign off on these exact parameters. Change one byte and the approval is void." |
| 5 | Carol | Approve. Quorum reaches 2/2 and the request is AUTHORIZED. Click **Execute** | "Two of three owners agreed, so now it executes, exactly once." |
| 6 | Alice | **Vault**: upload a file containing a secret word, then **Decrypt name** and **Decrypt & save** | "The file is encrypted in the browser. The server and storage only ever see ciphertext." |
| 7 | — | Terminal: `node --no-warnings --experimental-strip-types scripts/vault/leak-scan.ts <secret word>` → PASS. Optional: MinIO console http://localhost:9001 shows only opaque `v1/…` objects | "We scanned the database and storage for the secret. It isn't there." |
| 8 | Mallory | Overview shows no organization; the vault API returns 404 | "Outsiders can't even confirm the company or the file exists." |
| 9 | Alice | **Asset registry**: CRITICAL asset delete is blocked | "Critical assets can't be deleted by one person." |
| 10 | Erin | **Audit log**: every step above; click **Verify chain** (OK); Export CSV | "The auditor sees everything, read-only, with a hash chain that shows tampering." |
| 11 | Alice | **Security settings**: quorum policies + integration health | "Even the rules change only through a governed request." |

## Honesty lines (say them; judges respect them)

- The vault in this mode uses a **DEMO cipher**, as the red banner says. The real Tide end-to-end path is built, and the Tide realm is provisioned, but a live round trip wasn't completed today because of Tide network errors.
- Approvals are **application-level**. Cryptographic enforcement through Tide/Forseti is the next phase.
- The asset registry is **inventory only**. We don't control GitHub or AWS admin rights.

## Reset

Run `npm run seed:demo` again: it reuses the existing demo org. To start completely fresh, use a new database volume (`docker compose down -v` deletes ALL local data).
