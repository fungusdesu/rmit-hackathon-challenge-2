import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { governanceErrorResponse } from "@/lib/governance-error";
import { acceptInvitation } from "@/lib/invitations";

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    const body = await request.json();
    const token = typeof body?.token === "string" ? body.token : "";
    return NextResponse.json({ membership: await acceptInvitation(token, principal) }, { status: 201 });
  } catch (error) { return governanceErrorResponse(error); }
}
