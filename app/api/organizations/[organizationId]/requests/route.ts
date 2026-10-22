import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/errors";
import { requirePrincipal } from "@/lib/auth/server";
import { createActionRequest, listActionRequests, parseActionInput } from "@/lib/approvals";
import { isUniqueConstraintError } from "@/lib/organizations";

function requestError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === "forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (error.message.includes("required") || error.message.includes("must be") || error.message.includes("Only ") || error.message.includes("idempotencyKey")) return NextResponse.json({ error: "invalid_request", message: error.message }, { status: 400 });
  if (error.message.includes("Target") || error.message.includes("No active policy")) return NextResponse.json({ error: "unprocessable_request", message: error.message }, { status: 422 });
  return null;
}

export async function GET(request: NextRequest, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId } = await context.params;
    const requests = await listActionRequests(organizationId, principal);
    if (!requests) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ requests });
  } catch (error) {
    if (isUniqueConstraintError(error)) return NextResponse.json({ error: "idempotency_conflict" }, { status: 409 });
    return authErrorResponse(error) ?? requestError(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId } = await context.params;
    const actionRequest = await createActionRequest(organizationId, principal, parseActionInput(await request.json()));
    return NextResponse.json({ request: actionRequest, enforcement: "APP-LEVEL APPROVAL ONLY" }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error) ?? requestError(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
