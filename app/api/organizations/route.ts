import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/errors";
import { requirePrincipal } from "@/lib/auth/server";
import { createOrganization, isUniqueConstraintError, listOrganizations, parseOrganizationInput } from "@/lib/organizations";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    const organizations = await listOrganizations(principal);
    return NextResponse.json({ organizations });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    const input = parseOrganizationInput(await request.json());
    const organization = await createOrganization(principal, input);
    return NextResponse.json({ organization }, { status: 201 });
  } catch (error) {
    const authenticationResponse = authErrorResponse(error);
    if (authenticationResponse) return authenticationResponse;
    if (error instanceof Error && error.message.startsWith("Organization")) {
      return NextResponse.json({ error: "invalid_request", message: error.message }, { status: 400 });
    }
    if (isUniqueConstraintError(error)) return NextResponse.json({ error: "conflict" }, { status: 409 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
