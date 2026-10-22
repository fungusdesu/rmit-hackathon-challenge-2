import { NextRequest, NextResponse } from "next/server";
import { MembershipRole, MembershipStatus } from "@prisma/client";
import { authErrorResponse } from "@/lib/auth/errors";
import { requirePrincipal } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { getMembership } from "@/lib/organizations";
import { createInvitation, parseInvitation } from "@/lib/invitations";
import { governanceErrorResponse } from "@/lib/governance-error";

export async function GET(request: NextRequest, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId } = await context.params;
    const membership = await getMembership(organizationId, principal);
    if (!membership) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const members = await db.membership.findMany({
      where: { organizationId, status: membership.role === MembershipRole.OWNER || membership.role === MembershipRole.ADMIN ? { in: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED] } : MembershipStatus.ACTIVE },
      select: {
        id: true,
        role: true,
        status: true,
        joinedAt: true,
        user: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ members });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId } = await context.params;
    const issued = await createInvitation(organizationId, principal, parseInvitation(await request.json()));
    return NextResponse.json({ invitation: issued.invitation, acceptanceUrl: `${request.nextUrl.origin}/invitations/accept#token=${issued.token}` }, { status: 201 });
  } catch (error) {
    return governanceErrorResponse(error);
  }
}
