import { NextResponse } from "next/server";
import { AuthConfigurationError, AuthenticationError } from "./server";

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json({ error: "unauthorized", message: error.message }, { status: 401 });
  }

  if (error instanceof AuthConfigurationError) {
    return NextResponse.json({ error: "authentication_not_configured", message: error.message }, { status: 503 });
  }

  return null;
}
