# Vault — 5-Minute Judge Demo Script

Pick the variant **before** going on stage:

- **A · Tide mode:** only if rows 1, 4 and 6 of `TIDE_E2EE_VERIFICATION.md` passed on a live realm.
- **B · Development mode with the DEMO cipher:** the default today, because realm provisioning is
  blocked (`TIDE-IDPEXT-VENDOR-KEYGEN_FAILED`).

Never present B as E2EE.

## 0. Prep (before judges arrive, about 5 min)

```bash
docker compose up -d postgres minio minio-init     # Postgres :5432, MinIO :9000, console :9001
npx prisma migrate deploy
# Variant B (.env.local): AUTH_MODE=development, NEXT_PUBLIC_AUTH_MODE=development, ALLOW_INSECURE_DEV_AUTH=true
# Variant A (.env.local): AUTH_MODE=tidecloak, NEXT_PUBLIC_AUTH_MODE=tidecloak (+ realm config)
npm run dev 2>&1 | tee demo-dev.log                # log captured for the leak scan
```

Create a canary file. Use a string that appears nowhere else:

```bash
echo "BV-CANARY-$(date +%H%M%S)-quokka-tangerine" > canary.txt   # note the exact string
```

Create the demo org as Alice. It must have a name that starts with `Demo ` (required for reset, see §6).

- **Variant B:**
  `curl -s -X POST http://localhost:3000/api/organizations -H 'content-type: application/json' -H 'x-dev-user-subject: dev-alice' -H 'x-dev-user-name: Alice (dev)' -d '{"name":"Demo Vault Co"}'`
- **Variant A:** log in as alice and create "Demo Vault Co" in the dashboard.

Optional AUDITOR member. Invitations return 501 today, so this needs a direct insert into a
presenter-created org. Run it only after Carol has called any API once, which creates her `User` row:

```sql
-- psql postgresql://businessvault:businessvault@localhost:5432/businessvault
INSERT INTO "Membership"(id,"organizationId","userId",role,status,"updatedAt")
SELECT 'demo-aud-1', o.id, u.id, 'AUDITOR', 'ACTIVE', now()
FROM "Organization" o, "User" u
WHERE o.name = 'Demo Vault Co' AND u."tideSubject" = 'dev-carol';
```

The UI picker only lists Alice, Bob and Mallory, so show the AUDITOR with `curl` and
`x-dev-user-subject: dev-carol`. Open these browser tabs:

- `http://localhost:3000/dashboard/vault`
- `http://localhost:3000/dashboard/vault/diagnostics`
- `http://localhost:9001` (MinIO console; log in with the Compose credentials)
- a terminal

## 1. Pitch (30 s)

> BusinessVault is a governance platform for businesses where several people share ownership.
> It brings identity, encrypted company data, admin governance, approvals and an inventory of
> external assets into one place, so that no single founder, employee or compromised admin account
> can take over or expose the company's most valuable resources. We build on TideCloak's
> decentralized cryptography where it is feasible. Our goal is to enforce critical policies at
> the cryptographic or execution layer, and we say plainly where we can't yet. The vault you're
> about to see encrypts in the browser. Our servers and our storage only ever hold ciphertext.

## 2. Upload (60 s)

1. Open `/dashboard/vault`.
   - **B:** point at the red **"DEMO — NOT E2EE"** banner. Say: *"This is a dev-mode cipher with
     a browser-local key. Our server refuses this format in Tide mode."*
   - **A:** say: *"Encryption runs through Tide's `doEncrypt` with tag `vault`. It needs the
     `_tide_vault.selfencrypt` role."*
2. "Acting as": **Alice**. Organization: **Demo Vault Co**.
3. Upload form: classification **CONFIDENTIAL**, file `canary.txt`, then click **Encrypt & upload**.
   Say: *"The file and its name are encrypted before anything leaves the tab. We hash the
   ciphertext, not the plaintext, ask the server for a presigned upload, send ciphertext straight
   to storage, and the server re-checks size and hash on commit."*
4. The row appears as AVAILABLE with no filename. Click **Decrypt name**, then **Decrypt & save**.
   The saved file contains the canary. Say: *"Decryption happens only here, in the browser."*

## 3. Proof moment (75 s)

```bash
node --no-warnings --experimental-strip-types scripts/vault/leak-scan.ts "<canary>" --log-file demo-dev.log
```

Expect **PASS** for Postgres (`pg_dump`), every MinIO object, and the log. Say: *"We searched the
whole database dump, every stored object and the server log for the canary, in raw, UTF-16,
base64 and hex. It isn't there. Exit code 0."*

Switch to the MinIO console (`http://localhost:9001`), bucket `businessvault`. Show only opaque
`v1/<random>` keys, with no filenames or org ids, and download one to show it is unreadable.
Say: *"The object key is 256 random bits, and the API never returns it."*

## 4. Unauthorized users (60 s)

1. Switch "Acting as" to **Bob**, who is not a member. Demo Vault Co is not in his list. Then
   call the API directly:
   `curl -i -H 'x-dev-user-subject: dev-bob' http://localhost:3000/api/organizations/<orgId>/documents`
   → `404 {"error":"not_found"}`. Say: *"Non-member, other tenant and unknown id all return the
   same 404, so nothing leaks about whether the org exists."*
2. **AUDITOR (Carol)**, if set up:
   - `GET .../documents` → 200 with metadata only (no filename plaintext, no object key).
   - `POST .../documents/<docId>/download` → **403**.
   - `POST .../documents/upload-init` → **403**.

   Say: *"Auditors can see that a document exists and when, but cannot fetch even the ciphertext."*
3. **A only:** mallory has no vault roles, so Tide denies her encrypt and decrypt
   (verification rows 4 and 5).

## 5. Honest limitations (30 s, always say these)

- **Uploader-only decrypt.** Other org members can't decrypt yet. Shared or quorum decryption
  needs Tide policy-protected encryption, which is BLOCKED (`SHARED_DECRYPT.md`).
- **Metadata is visible** to the server: declared type, size, classification, uploader, timestamps.
- **The demo cipher is not E2EE** (variant B). Its key sits in the browser's IndexedDB.
- **We make no claim of protection against a compromised server** until the Tide path is verified
  live in this deployment. Today it is NOT VERIFIED.
- Files are capped at 5 MiB. Envelope encryption for large files is designed but awaiting
  review (`LARGE_FILES_DESIGN.md`).
- Plaintext already decrypted on a device cannot be revoked.

## 6. Reset demo data (safe, scoped)

Only orgs that the presenter created with the `Demo ` name prefix are removed. There is no
`migrate reset` and no volume deletion. Check first, then delete inside a transaction:

```sql
-- psql postgresql://businessvault:businessvault@localhost:5432/businessvault
SELECT id, name, "createdAt" FROM "Organization" WHERE name LIKE 'Demo %';   -- confirm the list
-- collect the object keys of those orgs before deleting the rows
SELECT d."objectKey" FROM "Document" d JOIN "Organization" o ON o.id = d."organizationId" WHERE o.name LIKE 'Demo %';
BEGIN;
DELETE FROM "Organization" WHERE name LIKE 'Demo %';  -- cascades Membership, Document, AuditEvent, ActionRequest rows of those orgs
COMMIT;   -- or ROLLBACK if the count is not what you expected
```

Then remove only the listed MinIO objects, one key at a time, in the MinIO console or with
`mc rm local/businessvault/v1/<key>`. Do not empty the bucket. Delete `canary.txt` and `demo-dev.log`.
Dev users (`dev-alice`, etc.) can stay; they hold no data.
