import { NextRequest, NextResponse } from "next/server";
import { createTideCloakProxy } from "@tidecloak/nextjs/server";
import { getTideConfig } from "@/lib/tide/config";

export async function proxy(request: NextRequest) {
  if (process.env.AUTH_MODE !== "tidecloak") return NextResponse.next();
  const config = getTideConfig();
  if (!config) return NextResponse.json({ error: "authentication_not_configured" }, { status: 503 });
  return createTideCloakProxy({
    config,
    protectedRoutes: {
      "/dashboard": [],
      "/dashboard/*": [],
      "/api/organizations/*": [],
    },
    onFailure: ({ token }, currentRequest) => {
      if (currentRequest.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: token ? "forbidden" : "unauthorized" }, { status: token ? 403 : 401 });
      return NextResponse.redirect(new URL("/auth/login", currentRequest.url));
    },
  })(request);
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/api/organizations/:path*"],
};
