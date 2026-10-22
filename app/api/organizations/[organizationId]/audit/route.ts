import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { governanceErrorResponse, GovernanceError } from "@/lib/governance-error";
import { getMembership } from "@/lib/organizations";
import { db } from "@/lib/db";
import { verifyAuditChain } from "@/lib/audit";

export async function GET(request: NextRequest, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId } = await context.params;
    if (!(await getMembership(organizationId, principal))) throw new GovernanceError("not_found", 404);
    const events = await db.auditEvent.findMany({ where: { organizationId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 100 });
    return NextResponse.json({ events, verification: await verifyAuditChain(organizationId), integrity: "DATABASE HASH CHAIN ONLY; NOT INDEPENDENTLY ANCHORED" });
  } catch (error) { return governanceErrorResponse(error); }
}
