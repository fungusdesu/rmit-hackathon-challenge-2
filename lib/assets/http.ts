import { NextRequest, NextResponse } from "next/server";
import { AuthConfigurationError, AuthenticationError, AuthorizationError } from "@/lib/auth/server";
import { AssetError } from "./validation";

const MAX_BODY = 16384;
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

export function assetJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: HEADERS });
}

export function assetErrorResponse(error: unknown) {
  if (error instanceof AuthenticationError) return assetJson({ error: "unauthorized" }, 401);
  if (error instanceof AuthorizationError) return assetJson({ error: "forbidden" }, 403);
  if (error instanceof AuthConfigurationError) return assetJson({ error: "authentication_not_configured" }, 503);
  if (error instanceof AssetError) {
    const body: Record<string, string> = { error: error.code };
    if (error.message !== error.code) body.message = error.message;
    if (error.field) body.field = error.field;
    return assetJson(body, error.status);
  }
  return assetJson({ error: "internal_error" }, 500);
}

/** CSRF: writes must be application/json and same-origin when Origin is present. */
export function assertSafeWrite(request: NextRequest, requireJson = true): void {
  if (requireJson) {
    const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") throw new AssetError("unsupported_content_type");
  }
  const origin = request.headers.get("origin");
  if (origin !== null) {
    let parsed: string;
    try { parsed = new URL(origin).origin; } catch { throw new AssetError("forbidden"); }
    if (parsed !== request.nextUrl.origin) throw new AssetError("forbidden");
  }
}

export async function readAssetBody(request: NextRequest): Promise<unknown> {
  const text = await request.text().catch(() => { throw new AssetError("invalid_request"); });
  if (text.length > MAX_BODY) throw new AssetError("payload_too_large");
  try { return JSON.parse(text); } catch { throw new AssetError("invalid_request"); }
}
