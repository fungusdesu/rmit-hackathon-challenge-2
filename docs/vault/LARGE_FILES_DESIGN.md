# Large Files — Envelope Encryption Design

> **NOT IMPLEMENTED — REVIEW REQUIRED.** This is a design for review. Spec §7.3 says envelope
> encryption may be used only after a key-wrapping design has been reviewed. The shipped vault
> encrypts the whole file with one Tide `doEncrypt` call, under a 5 MiB default cap and a
> 10 MiB hard cap (`lib/vault/contracts.ts`).

Labels: **VERIFIED (source)** means read in the installed SDK or the repo. **ASSUMPTION** means it
must be confirmed before implementation.

## 1. Goals and non-goals

Goals:
- Files up to about 2 GiB.
- Plaintext and the data-encryption key (DEK) never reach the server.
- Chunks cannot be reordered, truncated or swapped between files or versions without detection.
- Uploads can resume.

Non-goals:
- Deduplication.
- Server-side previews.
- Sharing (see `SHARED_DECRYPT.md`).
- Key escrow.

## 2. Scheme

| Element | Choice |
|---|---|
| DEK | 32 random bytes from `crypto.getRandomValues`, imported as a WebCrypto `AES-GCM` key with `extractable: false` immediately after it has been wrapped |
| Cipher | AES-256-GCM with a 128-bit tag |
| Chunk size | 8 MiB of plaintext (proposed; see §4 step 3) (`chunkSize` is stored in the manifest); the last chunk may be shorter but not empty, unless the file itself is empty (one empty chunk) |
| Nonce | 96 bits. `nonce = noncePrefix(8 random bytes, per file+version) ‖ uint32_be(chunkIndex)`. It is deterministic per chunk, so a retried chunk is re-encrypted with the **same** nonce and the **same** plaintext, producing identical output. There are no random per-chunk nonces, so there is no birthday risk |
| Associated data | Canonical bytes of `"bv-chunk-v1" ‖ documentId ‖ uint32 chunkIndex ‖ uint32 totalChunks ‖ uint32 version`, with length-prefixed strings |
| Wrapped DEK | `doEncrypt([{ data: dekBytes, tags: ["vault"] }])`, framed with the existing `frameTideOutput`. **VERIFIED (source):** `doEncrypt` accepts `Uint8Array` (`IAMService.d.ts`) |
| Wrapped manifest secrets | The filename is encrypted as today (`encryptedName`). The manifest body is in the clear but contains no plaintext-derived values except sizes |

Binding `totalChunks` into every chunk's associated data stops truncation: dropping the last
chunk changes the count that the remaining chunks were sealed with. Binding `documentId` and
`version` stops chunks being swapped across files or versions.

**ASSUMPTION:** `documentId` is known before encryption. That requires upload-init to happen
*before* encryption, which inverts today's order (encrypt → hash → init). The design therefore
uses a two-phase init (see §4).

## 3. Manifest (separate object `v1/<random key>`, JSON, ≤ 64 KiB)

```json
{
  "format": "bv-envelope-v1",
  "documentId": "c...",
  "version": 1,
  "cipher": "AES-256-GCM",
  "chunkSize": 8388608,
  "totalChunks": 19,
  "plaintextSize": 154000000,
  "noncePrefix": "base64(8 bytes)",
  "wrappedDek": { "format": "tide-e2ee-v1", "tag": "vault", "data": "base64(framed Tide output)" },
  "chunks": [ { "index": 0, "ciphertextSize": 8388624, "sha256": "hex" } ],
  "objectSha256": "hex SHA-256 over concatenated chunk ciphertexts in index order"
}
```

- `plaintextSize` is metadata leakage. It is about the same as the ciphertext size, which is
  already disclosed. Padding is out of scope.
- The server stores `objectSha256`, `totalChunks` and the manifest hash on the `Document` row.
  This needs a future additive migration, which needs teammate notice.

## 4. Upload flow (multipart via presigned part URLs)

1. `POST upload-init` with `{ mode: "envelope", plaintextSizeBucket, totalChunks, classification, declaredContentType, encryptedName? }`.
   The server creates the `PENDING_UPLOAD` row, calls S3 `CreateMultipartUpload`, and returns
   `{ documentId, version, uploadId, partUrls[0..n) }`. Each part URL is a presigned `UploadPart`
   URL with a short TTL. A part-URL refresh endpoint exists for long uploads.
   **ASSUMPTION:** MinIO CORS must expose `ETag`.
2. The browser generates the DEK and nonce prefix, wraps the DEK with Tide, and only then starts
   chunking. If wrapping fails, nothing is uploaded.
3. For each chunk *i*: read `file.slice(i*cs, (i+1)*cs)`, encrypt it with its associated data,
   compute the SHA-256 of the ciphertext chunk, `PUT` it to `partUrls[i]`, and record the ETag.
   S3 requires every part except the last to be at least 5 MiB, so either `chunkSize` is set to
   5 MiB or more, or several chunks are packed into one part. **Decision for reviewer:** chunk =
   part = 8 MiB.
4. Upload the manifest. Then `POST commit { parts: [{n, etag}], manifestSha256 }`. The server
   calls `CompleteMultipartUpload`, re-reads the parts' sizes, verifies the manifest hash and
   size bounds, and moves the row to `AVAILABLE`. A full `objectSha256` re-hash on the server is
   optional (it costs one streaming read and only ever sees ciphertext).

### Failure and resume

- Progress (`documentId`, `uploadId`, completed parts and ETags) is stored in IndexedDB. **The
  DEK is never stored there.** To resume, the browser must re-unwrap the DEK via Tide
  `doDecrypt` (wrapped DEK kept locally or re-fetched) and re-read the same `File`. Because the
  nonces are deterministic, re-encrypting a chunk reproduces the identical ciphertext, and the
  chunk hash confirms this.
- If the user picks a *different* file on resume, the first chunk hash mismatch aborts the upload.
- Expired pending uploads → `AbortMultipartUpload` by the GC job (pending GC is already DEFERRED
  in `STATUS.md`).
- Commit with missing parts → 409. Commit with a hash mismatch → 422, the upload is aborted, and
  the row goes to `REJECTED`.

## 5. Download / decrypt

- The server issues ranged presigned GETs, or one GET that the browser streams with `fetch`
  `ReadableStream`.
- The browser fetches the manifest, verifies its hash against the row, unwraps the DEK via
  `doDecrypt`, then decrypts each chunk with associated data rebuilt from **the row's**
  `documentId`, `version` and `totalChunks`, not the manifest's. It verifies each chunk hash and
  GCM tag and the final count, and checks `objectSha256` incrementally.
- Output: stream to disk with the File System Access API (`showSaveFilePicker`, Chromium) or a
  service-worker stream, falling back to an in-memory `Blob` for files of 200 MiB or less.
  Plaintext must never be released for a chunk that fails authentication. If any chunk fails,
  the partial output is discarded and the user sees `integrity_mismatch`.

## 6. Browser memory and streaming limits

- `file.slice()` + `arrayBuffer()` per chunk keeps peak memory at about 3× the chunk size
  (plaintext + ciphertext + in-flight request). With 8 MiB chunks and 3 parallel parts, that is
  roughly 75 MiB.
- WebCrypto `AES-GCM` is one-shot (it has no streaming API), which is why chunking is required. **VERIFIED** (WebCrypto `encrypt` takes a whole buffer).
- An in-memory `Blob` for very large files may hit tab memory limits. Streaming save is only
  available on Chromium. **ASSUMPTION:** a 2 GiB practical cap.
- Tide's payload size and latency are unknown (row 2 of `TIDE_E2EE_VERIFICATION.md` is pending).
  The DEK is only 32 bytes, so envelope mode makes Tide's size limit irrelevant. That is its
  main motivation.

## 7. Threats

| Threat | Mitigation / residual risk |
|---|---|
| DEK exposure in browser memory (XSS, malicious extension, devtools) | The raw DEK exists only between generation/unwrap and `importKey(extractable:false)`; the buffer is zeroed after import (best effort; JS GC may copy). **Residual:** XSS during a session can call `doDecrypt` itself. CSP and no third-party scripts are required |
| Nonce reuse | Deterministic `prefix ‖ index` with a fresh random prefix per (file, version). A new version **must** get a new DEK, and never only a new prefix under the same DEK. Retries reuse the nonce with identical plaintext only, which is safe because the output is identical |
| Chunk reorder, truncation or splice | Associated data binds index, total, documentId and version; per-chunk hashes; `objectSha256` |
| Manifest tampering by the server | The manifest hash is committed on the row at upload. **Residual:** a malicious server controls both row and object, so it can only cause denial of service. It cannot forge a GCM tag without the DEK |
| Key rotation | Rotating = re-wrapping the DEK under new Tide keys, which is cheap. Rotating the DEK means re-encrypting the whole file as a new version. Tide-side rotation semantics are **unknown** |
| Revocation | Removing a user's Tide role stops future unwraps. **It cannot revoke** a DEK or plaintext already unwrapped or saved. Same limit as today (`STATUS.md` security limits) |
| Wrapped-DEK sharing | Out of scope; inherits the uploader-only result of `SHARED_DECRYPT.md` |
| Oversized or malformed manifest (DoS on the client) | Size cap of 64 KiB, `totalChunks` ≤ ceil(maxSize/chunkSize), strict schema parse before use |

## 8. Reviewer sign-off checklist (all required before implementation)

- [ ] Tide confirms `doEncrypt` / `doDecrypt` on a 32-byte `Uint8Array` works, and its output type is recorded (verification row 2).
- [ ] Associated-data encoding and nonce construction reviewed by someone with crypto review experience; test vectors written.
- [ ] Rule "new version ⇒ new DEK" is enforced in code and tested.
- [ ] Decision on the chunk/part size versus the S3 5 MiB minimum part size.
- [ ] Order change: init before encrypt; `documentId` and `version` come from the server and are bound into the associated data.
- [ ] The additive schema migration (manifest hash, totalChunks, uploadId) is agreed with teammates.
- [ ] MinIO CORS exposes `ETag` only for `http://localhost:3000`.
- [ ] Resume never persists the DEK; IndexedDB contents are reviewed.
- [ ] The decrypt path never releases unauthenticated plaintext (streaming writes only after the tag verifies, per chunk).
- [ ] Pending-multipart garbage collection is implemented (abort and delete).
- [ ] The leak-scan script is extended to scan multipart objects and manifests.
- [ ] Threat table re-checked against `SHARED_DECRYPT.md` once realm row 3 has run.
