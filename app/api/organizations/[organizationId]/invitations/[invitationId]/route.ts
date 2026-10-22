import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { governanceErrorResponse } from "@/lib/governance-error";
import { revokeInvitation } from "@/lib/invitations";

export async function DELETE(request: NextRequest, context: { params: Promise<{ organizationId: string; invitationId: string }> }) {
  try {
    const { organizationId, invitationId } = await context.params;
    return NextResponse.json({ invitation: await revokeInvitation(organizationId, invitationId, await requirePrincipal(request)) });
  } catch (error) { return governanceErrorResponse(error); }
}
