import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { governanceErrorResponse } from "@/lib/governance-error";
import { listPolicies } from "@/lib/membership-governance";

export async function GET(request: NextRequest, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const { organizationId } = await context.params;
    return NextResponse.json({ policies: await listPolicies(organizationId, await requirePrincipal(request)), enforcement: "APP-LEVEL APPROVAL ONLY" });
  } catch (error) { return governanceErrorResponse(error); }
}
