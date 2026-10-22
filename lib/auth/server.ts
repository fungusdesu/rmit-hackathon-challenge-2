import { NextRequest } from "next/server";
import type { Principal } from "./types";

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
    throw new AuthConfigurationError(
      "TideCloak authentication is not configured. Set AUTH_MODE=development only for local development.",
    );
  }

  throw new AuthConfigurationError(`Unsupported AUTH_MODE: ${mode}`);
}
