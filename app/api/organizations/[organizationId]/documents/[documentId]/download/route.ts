import { NextRequest } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { issueDownload } from "@/lib/vault/server/documents";
import { assertSafePost, json, vaultErrorResponse } from "@/lib/vault/server/http";

export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string; documentId: string }> }) {
  try {
    assertSafePost(request);
    const principal = await requirePrincipal(request);
    const { organizationId, documentId } = await context.params;
    return json({ download: await issueDownload(organizationId, principal, documentId) });
  } catch (error) {
    return vaultErrorResponse(error);
  }
}
