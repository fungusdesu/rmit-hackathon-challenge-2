import { NextRequest } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { initUpload } from "@/lib/vault/server/documents";
import { json, readJsonBody, vaultErrorResponse } from "@/lib/vault/server/http";
import { parseUploadInit } from "@/lib/vault/server/validation";

export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId } = await context.params;
    const input = parseUploadInit(await readJsonBody(request));
    return json(await initUpload(organizationId, principal, input), 201);
  } catch (error) {
    return vaultErrorResponse(error);
  }
}
