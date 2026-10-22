import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/errors";
import { requirePrincipal } from "@/lib/auth/server";
import { cancelActionRequest } from "@/lib/approvals";

export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string; requestId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId, requestId } = await context.params;
    return NextResponse.json({ request: await cancelActionRequest(organizationId, requestId, principal) });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : "internal_error" }, { status: 409 });
  }
}
