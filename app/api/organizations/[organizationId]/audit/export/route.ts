import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { governanceErrorResponse, GovernanceError } from "@/lib/governance-error";
import { exportAuditForPrincipal, INTEGRITY_NOTE, toCsv } from "@/lib/audit-verify";

export async function GET(request: NextRequest, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId } = await context.params;
    const format = request.nextUrl.searchParams.get("format") ?? "json";
    if (format !== "json" && format !== "csv") throw new GovernanceError("invalid_format", 400);
    const events = await exportAuditForPrincipal(organizationId, principal);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const headers = { "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="audit-${organizationId}-${stamp}.${format}"`, "X-Content-Type-Options": "nosniff" };
    if (format === "csv") return new NextResponse(toCsv(events), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
    return new NextResponse(JSON.stringify({ organizationId, exportedAt: new Date().toISOString(), integrity: INTEGRITY_NOTE, events }, null, 2), { headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
  } catch (error) { return governanceErrorResponse(error); }
}
