import { NextRequest } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { getDocument } from "@/lib/vault/server/documents";
import { json, vaultErrorResponse } from "@/lib/vault/server/http";

export async function GET(request: NextRequest, context: { params: Promise<{ organizationId: string; documentId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId, documentId } = await context.params;
    return json({ document: await getDocument(organizationId, principal, documentId) });
  } catch (error) {
    return vaultErrorResponse(error);
  }
}
