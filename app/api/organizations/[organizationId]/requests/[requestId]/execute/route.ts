import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { executeActionRequest } from "@/lib/approvals";
import { governanceErrorResponse } from "@/lib/governance-error";

export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string; requestId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId, requestId } = await context.params;
    const result = await executeActionRequest(organizationId, requestId, principal);
    return NextResponse.json({ execution: result.execution, ...(result.invitationToken ? { acceptanceUrl: `${request.nextUrl.origin}/invitations/accept#token=${result.invitationToken}` } : {}), enforcement: "APP-LEVEL APPROVAL ONLY" }, { status: result.execution.status === "FAILED" ? 409 : 200 });
  } catch (error) {
    return governanceErrorResponse(error);
  }
}
