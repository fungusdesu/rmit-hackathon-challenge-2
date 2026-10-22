import { NextRequest, NextResponse } from "next/server";
import { ApprovalDecision } from "@prisma/client";
import { requirePrincipal } from "@/lib/auth/server";
import { recordApproval } from "@/lib/approvals";
import { governanceErrorResponse } from "@/lib/governance-error";

export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string; requestId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId, requestId } = await context.params;
    const approval = await recordApproval(organizationId, requestId, principal, ApprovalDecision.APPROVED);
    return NextResponse.json({ approval, enforcement: "APP-LEVEL APPROVAL ONLY" }, { status: 201 });
  } catch (error) {
    return governanceErrorResponse(error);
  }
}
