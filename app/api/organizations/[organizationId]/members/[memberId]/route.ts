import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { governanceErrorResponse } from "@/lib/governance-error";
import { changeOrdinaryMember, parseMemberChange } from "@/lib/membership-governance";

export async function PATCH(request: NextRequest, context: { params: Promise<{ organizationId: string; memberId: string }> }) {
  try {
    const { organizationId, memberId } = await context.params;
    return NextResponse.json({ member: await changeOrdinaryMember(organizationId, memberId, await requirePrincipal(request), parseMemberChange(await request.json())) });
  } catch (error) { return governanceErrorResponse(error); }
}
