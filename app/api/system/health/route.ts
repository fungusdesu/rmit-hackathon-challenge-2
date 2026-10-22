import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { governanceErrorResponse } from "@/lib/governance-error";
import { getSystemHealth } from "@/lib/system-health";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requirePrincipal(request);
    return NextResponse.json({ health: await getSystemHealth() }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return governanceErrorResponse(error); }
}
