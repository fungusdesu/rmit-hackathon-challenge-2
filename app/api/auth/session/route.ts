import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/errors";
import { requirePrincipal } from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    return NextResponse.json({
      authenticated: true,
      principal: {
        subject: principal.subject,
        displayName: principal.displayName,
        email: principal.email,
        source: principal.source,
      },
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
