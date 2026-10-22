import { NextRequest } from "next/server";
import { requirePrincipal, requireTideRole } from "@/lib/auth/server";
import { TIDE_VAULT_ROLES } from "@/lib/vault/contracts";
import { initUpload, requireMember } from "@/lib/vault/server/documents";
import { assertSafePost, json, readJsonBody, vaultErrorResponse } from "@/lib/vault/server/http";
import { parseUploadInit } from "@/lib/vault/server/validation";

export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string }> }) {
  try {
    assertSafePost(request);
    const principal = await requirePrincipal(request);
    const { organizationId } = await context.params;
    // Membership first: non-members get not_found regardless of what they send.
    await requireMember(organizationId, principal);
    // The Tide fabric refuses encryption without this role; the server refuses the upload too.
    requireTideRole(principal, TIDE_VAULT_ROLES.encrypt);
    const input = parseUploadInit(await readJsonBody(request));
    return json(await initUpload(organizationId, principal, input), 201);
  } catch (error) {
    return vaultErrorResponse(error);
  }
}
