import { NextRequest, NextResponse } from "next/server";
import { RequestStatus } from "@prisma/client";
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

    const [pendingApprovals, protectedDocuments, activeOwners, securityEvents] = await Promise.all([
      db.actionRequest.count({ where: { organizationId, status: RequestStatus.PENDING } }),
      db.document.count({ where: { organizationId } }),
      db.membership.count({ where: { organizationId, role: "OWNER", status: "ACTIVE" } }),
      db.auditEvent.count({ where: { organizationId, occurredAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
    ]);

    return NextResponse.json({ summary: { pendingApprovals, protectedDocuments, activeOwners, securityEvents } });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
