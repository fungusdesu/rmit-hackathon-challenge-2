import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/errors";
import { requirePrincipal } from "@/lib/auth/server";
import { executeActionRequest } from "@/lib/approvals";

export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string; requestId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId, requestId } = await context.params;
    return NextResponse.json({ execution: await executeActionRequest(organizationId, requestId, principal), enforcement: "APP-LEVEL APPROVAL ONLY" });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : "internal_error" }, { status: 409 });
  }
}
