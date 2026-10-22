import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { createActionRequest, listActionRequests, parseActionInput } from "@/lib/approvals";
import { governanceErrorResponse } from "@/lib/governance-error";

export async function GET(request: NextRequest, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId } = await context.params;
    const requests = await listActionRequests(organizationId, principal);
    if (!requests) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ requests, enforcement: "APP-LEVEL APPROVAL ONLY" });
  } catch (error) {
    return governanceErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId } = await context.params;
    const actionRequest = await createActionRequest(organizationId, principal, parseActionInput(await request.json()));
    return NextResponse.json({ request: actionRequest, enforcement: "APP-LEVEL APPROVAL ONLY" }, { status: 201 });
  } catch (error) {
    return governanceErrorResponse(error);
  }
}
