import { NextRequest, NextResponse } from "next/server";
import { createTideCloakProxy, verifyTideCloakToken } from "@tidecloak/nextjs/server";
import { getTideConfig } from "@/lib/tide/config";
import { simulatedTideConfig, simulationEnabled } from "@/lib/auth/sim/issuer";

function deny(request: NextRequest, hadToken: boolean) {
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: hadToken ? "forbidden" : "unauthorized" }, { status: hadToken ? 403 : 401 });
  return NextResponse.redirect(new URL("/auth/login", request.url));
}

export async function proxy(request: NextRequest) {
  const mode = process.env.AUTH_MODE;
  if (mode === "tidecloak-sim") {
    // Same check the Tide proxy makes: a kcToken that verifies against the realm's embedded JWKS.
    // Route handlers verify again server-side (requirePrincipal); this only gates navigation.
    if (!simulationEnabled()) return NextResponse.json({ error: "authentication_not_configured" }, { status: 503 });
    const token = request.cookies.get("kcToken")?.value;
    const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const valid = await verifyTideCloakToken(simulatedTideConfig(), bearer ?? token ?? "").catch(() => null);
    return valid ? NextResponse.next() : deny(request, Boolean(bearer ?? token));
  }
  if (mode !== "tidecloak") return NextResponse.next();
  const config = getTideConfig();
  if (!config) return NextResponse.json({ error: "authentication_not_configured" }, { status: 503 });
  return createTideCloakProxy({
    config,
    protectedRoutes: {
      "/dashboard": [],
      "/dashboard/*": [],
      "/api/auth/session": [],
      "/api/organizations/*": [],
      "/api/invitations/*": [],
    },
    onFailure: ({ token }, currentRequest) => deny(currentRequest, Boolean(token)),
  })(request);
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/api/auth/session", "/api/organizations/:path*", "/api/invitations/:path*"],
};
