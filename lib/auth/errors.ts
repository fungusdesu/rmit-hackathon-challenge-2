import { NextResponse } from "next/server";
import { AuthConfigurationError, AuthenticationError, AuthorizationError } from "./server";

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json({ error: "unauthorized", message: error.message }, { status: 401 });
  }

  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: "forbidden", message: error.message }, { status: 403 });
  }

  if (error instanceof AuthConfigurationError) {
    return NextResponse.json({ error: "authentication_not_configured", message: error.message }, { status: 503 });
  }

  return null;
}
