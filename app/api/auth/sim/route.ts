import { NextRequest, NextResponse } from "next/server";
import { issueSimulatedToken, SIM_TOKEN_TTL_SECONDS, simulationEnabled } from "@/lib/auth/sim/issuer";
import { findSimUser } from "@/lib/auth/sim/realm";

// Simulated TideCloak sign-in (AUTH_MODE=tidecloak-sim only). Stands in for the Tide enclave + token
// endpoint: issues a signed access token and sets the same `kcToken` cookie the Tide SDK sets.
const COOKIE = "kcToken";

function crossSite(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false; // scripts (seed-demo) send no Origin and use the returned Bearer token
  const app = process.env.APP_ORIGIN;
  return !app || new URL(origin).origin !== new URL(app).origin;
}

export async function POST(request: NextRequest) {
  if (!simulationEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (crossSite(request)) return NextResponse.json({ error: "forbidden", message: "Same-origin request required" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { username?: unknown };
  const user = findSimUser(body.username);
  if (!user) return NextResponse.json({ error: "invalid_grant", message: "Unknown account in the simulated realm." }, { status: 401 });
  const token = await issueSimulatedToken(user);
  const response = NextResponse.json({ access_token: token, token_type: "Bearer", expires_in: SIM_TOKEN_TTL_SECONDS, username: user.username, roles: user.realmRoles });
  response.cookies.set(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: SIM_TOKEN_TTL_SECONDS });
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!simulationEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (crossSite(request)) return NextResponse.json({ error: "forbidden", message: "Same-origin request required" }, { status: 403 });
  const response = NextResponse.json({ signedOut: true });
  response.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
