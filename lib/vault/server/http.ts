import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/errors";
import { StorageUnavailableError } from "@/lib/storage";
import { VAULT_ERRORS, VaultError } from "@/lib/vault/contracts";

const MAX_JSON_BODY_BYTES = 16384;

export const VAULT_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
});

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: VAULT_RESPONSE_HEADERS });
}

export function vaultErrorResponse(error: unknown) {
  const auth = authErrorResponse(error);
  if (auth) return json({ error: auth.status === 401 ? "unauthorized" : "authentication_not_configured" }, auth.status);
  if (error instanceof VaultError) return json({ error: error.code }, error.status);
  if (error instanceof StorageUnavailableError) return json({ error: "storage_unavailable" }, VAULT_ERRORS.storage_unavailable);
  return json({ error: "internal_error" }, VAULT_ERRORS.internal_error);
}

export async function readJsonBody(request: NextRequest): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_JSON_BODY_BYTES) throw new VaultError("payload_too_large");
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new VaultError("invalid_request");
  }
  if (text.length > MAX_JSON_BODY_BYTES) throw new VaultError("payload_too_large");
  try {
    return JSON.parse(text);
  } catch {
    throw new VaultError("invalid_request");
  }
}
