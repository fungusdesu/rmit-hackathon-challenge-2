import { NextRequest } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { listDocuments } from "@/lib/vault/server/documents";
import { json, vaultErrorResponse } from "@/lib/vault/server/http";

export async function GET(request: NextRequest, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId } = await context.params;
    return json({ documents: await listDocuments(organizationId, principal) });
  } catch (error) {
    return vaultErrorResponse(error);
  }
}
