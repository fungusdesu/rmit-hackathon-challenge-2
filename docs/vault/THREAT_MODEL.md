# Vault threat model

Claims here are limited to what the code does and what `tests/vault` exercises. Anything that relies on Tide's cryptography is marked **depends on Tide verification** until `docs/vault/TIDE_E2EE_VERIFICATION.md` records a passing live run.

## Trust boundaries

1. **Browser (trusted for plaintext).** Plaintext and the decrypted filename exist only here. The browser encrypts through `VaultCipher` (Tide `selfencrypt`/`selfdecrypt` roles, or the dev-only demo AES key in IndexedDB). It computes SHA-256 over **ciphertext** and verifies that hash before decrypting.
2. **API (Next.js, untrusted for plaintext).** The API authenticates the principal (`requirePrincipal`: verified TideCloak JWT, or dev headers when `AUTH_MODE=development` and `ALLOW_INSECURE_DEV_AUTH=true`). It enforces membership and role on every call, mints presigned URLs, and verifies size and hash at commit. It sees only ciphertext and metadata.
3. **Postgres.** Holds metadata rows and the hash-chained audit log. It never holds plaintext or keys.
4. **MinIO.** Holds opaque ciphertext under random keys (`v1/<32 random bytes>`). The browser talks to it directly via presigned POST/GET, so the app token never reaches storage.
5. **Tide network.** Holds key shares and enforces the encrypt/decrypt roles. It sits outside our enforcement boundary.

## Adversaries (spec §10)

| # | Adversary | Verdict | Why |
|---|---|---|---|
| 1 | External attacker with a stolen token | **Not protected** within the token's lifetime | The token grants the full member role: list, upload, download URL, and decryption if the Tide session is also usable. Presigned GETs are limited to 60 s, single key. |
| 2 | Malicious ordinary member | **Protected** against other members' downloads and other tenants (tested). **Partially** for integrity: they can replace their **own** committed object via policy replay (F-01), which readers detect as `integrity_mismatch`. | Matrix in `documents.ts`. Listing metadata of others' docs is allowed by design. |
| 3 | Malicious owner/admin alone | **Not protected** for ciphertext access (admins may download all org docs). Plaintext **depends on Tide verification** (self-encrypt policy should block decryption of others' files). | No quorum gate on vault operations. |
| 4 | DB or object-storage attacker | Confidentiality **depends on Tide verification**. Metadata is **not protected** (see inventory). Integrity: the client detects ciphertext swaps only if the DB `hash` is untouched, so an attacker who controls both can swap undetected (decryption then fails under AEAD). | Storage holds only ciphertext; keys are not stored alongside. |
| 5 | Compromised app server | **Not protected** for metadata, availability or integrity. It can serve malicious JS that exfiltrates plaintext. Even assuming honest JS, confidentiality **depends on Tide verification**. | The server ships the client code, so this is a fundamental web-E2EE limit. |
| 6 | Compromised device of a legitimate user | **Not protected** | Plaintext is present in that browser. |
| 7 | Colluding quorum | **Not applicable / not protected** | The vault has no quorum gate. |
| 8 | Malicious or unavailable provider / insufficient Tide nodes | Availability **not protected** (decrypt fails closed). Confidentiality **depends on Tide verification**. | Demo cipher is refused outside development mode (server validation plus client throw), so there is no silent fallback to non-E2EE. Exception: legacy demo rows remain downloadable (F-04). |

## Metadata exposure inventory

Who can read what:

- "Members" means any ACTIVE member including AUDITOR, via `GET /documents` and `GET /documents/:id`.
- PENDING rows are visible only to their uploader.
- DB/server means a database operator or the app server.

| Field | Content | Readable by |
|---|---|---|
| `id` | cuid | members, DB/server |
| `organizationId` | tenant id | members, DB/server |
| `ownerId` / owner `displayName` | uploader identity | members, DB/server |
| `objectKey` | random storage key | DB/server only (never returned by API; tested) |
| `ciphertextFormat` | `tide-e2ee-v1` / `demo-not-e2ee-v1` | members, DB/server |
| `encryptionPolicyTag` | `vault` | members, DB/server |
| `size` | ciphertext byte length (≈ plaintext length) | members, DB/server, MinIO |
| `hash` | SHA-256 of ciphertext | members, DB/server |
| `classification` | INTERNAL/CONFIDENTIAL/RESTRICTED | members, DB/server |
| `declaredContentType` | plaintext MIME (user-declared) | members, DB/server |
| `encryptedName` | ciphertext of filename (length leaks ≈ name length) | members, DB/server; plaintext only to a decrypt-capable browser |
| `version`, `status` | lifecycle | members, DB/server |
| `uploadExpiresAt` | pending deadline | DB/server only |
| `createdAt`, `committedAt`, `updatedAt` | timing | members (created/committed), DB/server |
| Audit `actorId`, `action`, `target` (document id), `occurredAt` | who did what, when (`DOCUMENT_UPLOAD_INITIATED`, `_COMMITTED`, `_REJECTED`, `_DOWNLOAD_ISSUED`) | DB/server; org audit-log readers per main app |
| Audit `eventJson` | `{documentId, size, classification, ciphertextFormat}` | same as above |
| MinIO object | ciphertext, size, upload time, uploader IP | MinIO operator |
| Presigned URLs | key + signature, 60 s / 5 min | the requesting browser; may appear in browser history and devtools |

## Known open items
See `SECURITY_REVIEW.md`: F-01 (policy replay after commit), F-02 (orphan after reject), F-03 (commit not rate-limited), F-04 (legacy demo rows), F-05 (no sweeper), F-06 (in-memory limiter), F-07 (CSRF via cookie token).
