import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { cancelActionRequest } from "@/lib/approvals";
import { governanceErrorResponse } from "@/lib/governance-error";

export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string; requestId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId, requestId } = await context.params;
    return NextResponse.json({ request: await cancelActionRequest(organizationId, requestId, principal), enforcement: "APP-LEVEL APPROVAL ONLY" });
  } catch (error) {
    return governanceErrorResponse(error);
  }
}
