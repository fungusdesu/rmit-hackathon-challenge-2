import { NextRequest } from "next/server";
import { verifyTideCloakToken } from "@tidecloak/verify";
import type { Principal } from "./types";
import { getTideConfig } from "@/lib/tide/config";
import { simulatedTideConfig, simulationEnabled } from "./sim/issuer";
import { TIDE_ENABLED_ROLE } from "./sim/realm";
import { TIDE_VAULT_ROLES } from "@/lib/vault/contracts";

export class AuthConfigurationError extends Error {}
export class AuthenticationError extends Error {}
export class AuthorizationError extends Error {}

function configuredAppOrigin() {
  const configured = process.env.APP_ORIGIN;
  if (!configured) throw new AuthConfigurationError("APP_ORIGIN is required for cookie-authenticated mutations");
  try {
    return new URL(configured).origin;
  } catch {
    throw new AuthConfigurationError("APP_ORIGIN must be an absolute URL origin");
  }
}

function requireTrustedOrigin(request: NextRequest) {
  const header = request.headers.get("origin");
  if (!header) throw new AuthorizationError("Same-origin request required");
  let origin: string;
  try {
    origin = new URL(header).origin;
  } catch {
    throw new AuthorizationError("Same-origin request required");
  }
  if (origin !== configuredAppOrigin()) throw new AuthorizationError("Same-origin request required");
}

function developmentPrincipal(request: NextRequest): Principal {
  if (process.env.ALLOW_INSECURE_DEV_AUTH !== "true") {
    throw new AuthConfigurationError("Development authentication requires ALLOW_INSECURE_DEV_AUTH=true");
  }

  // Development only: headers win, then the dashboard's "Acting as" cookies, then env defaults.
  const cookie = (name: string) => {
    const value = request.cookies.get(name)?.value;
    try { return value ? decodeURIComponent(value) : undefined; } catch { return undefined; }
  };
  const subject = request.headers.get("x-dev-user-subject") ?? cookie("bv-dev-subject") ?? process.env.DEV_AUTH_SUBJECT;
  if (!subject) {
    throw new AuthenticationError("Set DEV_AUTH_SUBJECT or send x-dev-user-subject for local development");
  }

  return {
    subject,
    displayName: request.headers.get("x-dev-user-name") ?? cookie("bv-dev-name") ?? process.env.DEV_AUTH_NAME ?? "Development User",
    email: request.headers.get("x-dev-user-email") ?? cookie("bv-dev-email") ?? process.env.DEV_AUTH_EMAIL ?? null,
    emailVerified: request.headers.get("x-dev-user-email-verified") !== "false",
    source: "development",
    roles: [TIDE_ENABLED_ROLE, TIDE_VAULT_ROLES.encrypt, TIDE_VAULT_ROLES.decrypt],
  };
}

/** Realm roles plus the client's own roles, as TideCloak puts them in an access token. */
export function tokenRoles(payload: Record<string, unknown>, clientId: string): string[] {
  const realm = (payload.realm_access as { roles?: unknown } | undefined)?.roles;
  const client = ((payload.resource_access as Record<string, { roles?: unknown }> | undefined)?.[clientId])?.roles;
  return [...new Set([...(Array.isArray(realm) ? realm : []), ...(Array.isArray(client) ? client : [])].filter((r): r is string => typeof r === "string"))];
}

/** Adapter config for the active Tide mode: the live realm, or the local simulation. */
export function activeTideConfig(mode = process.env.AUTH_MODE ?? "tidecloak") {
  if (mode === "tidecloak-sim") {
    if (!simulationEnabled()) throw new AuthConfigurationError("Simulated TideCloak requires ALLOW_INSECURE_DEV_AUTH=true");
    return simulatedTideConfig();
  }
  const config = getTideConfig();
  if (!config) throw new AuthConfigurationError("TideCloak is not configured");
  return config;
}

/** Server-side role check, after token verification (Tide invariant I-08: UI gating is not authorization). */
export function requireTideRole(principal: Principal, role: string) {
  if (!principal.roles.includes(role)) throw new AuthorizationError(`Your TideCloak account lacks the ${role} role.`);
}

export async function requirePrincipal(request: NextRequest): Promise<Principal> {
  const mode = process.env.AUTH_MODE ?? "tidecloak";

  if (mode === "development") return developmentPrincipal(request);

  if (mode === "tidecloak" || mode === "tidecloak-sim") {
    const config = activeTideConfig(mode);
    const cookieToken = request.cookies.get("kcToken")?.value;
    const bearerToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (cookieToken && !bearerToken && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      requireTrustedOrigin(request);
    }
    const token = bearerToken ?? cookieToken;
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
    const roles = tokenRoles(payload, config.resource as string);
    // Tide's gate role: every Tide-enabled realm user has it. TIDE_REQUIRED_ROLE="" disables the gate.
    const gate = process.env.TIDE_REQUIRED_ROLE ?? TIDE_ENABLED_ROLE;
    if (gate && !roles.includes(gate)) throw new AuthorizationError(`This account is not enabled for Tide (missing ${gate}).`);
    return {
      subject,
      displayName: typeof payload.name === "string" ? payload.name : typeof payload.preferred_username === "string" ? payload.preferred_username : subject,
      email: typeof payload.email === "string" ? payload.email : null,
      emailVerified: payload.email_verified === true,
      source: mode,
      roles,
    };
  }

  throw new AuthConfigurationError(`Unsupported AUTH_MODE: ${mode}`);
}
