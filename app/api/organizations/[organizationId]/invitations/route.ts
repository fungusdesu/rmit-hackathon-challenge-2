import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { governanceErrorResponse } from "@/lib/governance-error";
import { createInvitation, listInvitations, parseInvitation } from "@/lib/invitations";

type Context = { params: Promise<{ organizationId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const { organizationId } = await context.params;
    return NextResponse.json({ invitations: await listInvitations(organizationId, await requirePrincipal(request)) });
  } catch (error) { return governanceErrorResponse(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const { organizationId } = await context.params;
    const issued = await createInvitation(organizationId, await requirePrincipal(request), parseInvitation(await request.json()));
    return NextResponse.json({ invitation: issued.invitation, acceptanceUrl: `${request.nextUrl.origin}/invitations/accept#token=${issued.token}` }, { status: 201 });
  } catch (error) { return governanceErrorResponse(error); }
}
