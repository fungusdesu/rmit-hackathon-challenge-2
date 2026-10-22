import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/errors";
import { requirePrincipal } from "@/lib/auth/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    const user = await db.user.findUnique({ where: { tideSubject: principal.subject }, select: { id: true } });
    return NextResponse.json({
      authenticated: true,
      principal: {
        userId: user?.id ?? null,
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
