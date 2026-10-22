import { NextRequest, NextResponse } from "next/server";
import { MembershipRole, MembershipStatus } from "@prisma/client";
import { authErrorResponse } from "@/lib/auth/errors";
import { requirePrincipal } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { getMembership } from "@/lib/organizations";

export async function GET(request: NextRequest, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId } = await context.params;
    const membership = await getMembership(organizationId, principal);
    if (!membership) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const members = await db.membership.findMany({
      where: { organizationId, status: MembershipStatus.ACTIVE },
      select: {
        id: true,
        role: true,
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
    const requester = await getMembership(organizationId, principal);
    if (!requester || (requester.role !== MembershipRole.OWNER && requester.role !== MembershipRole.ADMIN)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      { error: "not_implemented", message: "Invitations will be added with token hashing and expiry handling." },
      { status: 501 },
    );
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
