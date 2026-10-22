import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { governanceErrorResponse } from "@/lib/governance-error";
import { verifyAuditForPrincipal } from "@/lib/audit-verify";

export async function GET(request: NextRequest, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId } = await context.params;
    const result = await verifyAuditForPrincipal(organizationId, principal);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return governanceErrorResponse(error); }
}
