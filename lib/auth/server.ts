import { NextRequest } from "next/server";
import { verifyTideCloakToken } from "@tidecloak/nextjs/server";
import type { Principal } from "./types";
import { getTideConfig } from "@/lib/tide/config";

export class AuthConfigurationError extends Error {}
export class AuthenticationError extends Error {}

function developmentPrincipal(request: NextRequest): Principal {
  if (process.env.ALLOW_INSECURE_DEV_AUTH !== "true") {
    throw new AuthConfigurationError("Development authentication requires ALLOW_INSECURE_DEV_AUTH=true");
  }

  const subject = request.headers.get("x-dev-user-subject") ?? process.env.DEV_AUTH_SUBJECT;
  if (!subject) {
    throw new AuthenticationError("Set DEV_AUTH_SUBJECT or send x-dev-user-subject for local development");
  }

  return {
    subject,
    displayName: request.headers.get("x-dev-user-name") ?? process.env.DEV_AUTH_NAME ?? "Development User",
    email: request.headers.get("x-dev-user-email") ?? process.env.DEV_AUTH_EMAIL ?? null,
    source: "development",
  };
}

export async function requirePrincipal(request: NextRequest): Promise<Principal> {
  const mode = process.env.AUTH_MODE ?? "tidecloak";

  if (mode === "development") return developmentPrincipal(request);

  if (mode === "tidecloak") {
    const config = getTideConfig();
    if (!config) throw new AuthConfigurationError("TideCloak is not configured");
    const cookieToken = request.cookies.get("kcToken")?.value;
    const bearerToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const token = cookieToken ?? bearerToken;
    if (!token) throw new AuthenticationError("A TideCloak access token is required");
    let payload;
    try {
      payload = await verifyTideCloakToken(config, token);
    } catch {
      throw new AuthenticationError("TideCloak token verification failed");
    }
    if (!payload) throw new AuthenticationError("TideCloak token verification failed");
    const subject = typeof payload.sub === "string" ? payload.sub : null;
    if (!subject) throw new AuthenticationError("Verified TideCloak token has no subject");
    return {
      subject,
      displayName: typeof payload.name === "string" ? payload.name : typeof payload.preferred_username === "string" ? payload.preferred_username : subject,
      email: typeof payload.email === "string" ? payload.email : null,
      source: "tidecloak",
    };
  }

  throw new AuthConfigurationError(`Unsupported AUTH_MODE: ${mode}`);
}
