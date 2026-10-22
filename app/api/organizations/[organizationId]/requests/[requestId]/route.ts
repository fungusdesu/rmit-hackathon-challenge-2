import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/errors";
import { requirePrincipal } from "@/lib/auth/server";
import { getMembership } from "@/lib/organizations";
import { db } from "@/lib/db";

export async function GET(request: NextRequest, context: { params: Promise<{ organizationId: string; requestId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId, requestId } = await context.params;
    if (!(await getMembership(organizationId, principal))) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const actionRequest = await db.actionRequest.findFirst({ where: { id: requestId, organizationId }, include: { approvals: { include: { approver: { select: { displayName: true, email: true } } } }, requester: { select: { displayName: true, email: true } }, executions: true } });
    if (!actionRequest) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ request: actionRequest, enforcement: "APP-LEVEL APPROVAL ONLY" });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
