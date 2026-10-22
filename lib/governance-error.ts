import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { authErrorResponse } from "./auth/errors";

export class GovernanceError extends Error {
  constructor(public code: string, public status: number, message = code) {
    super(message);
  }
}

export function governanceError(error: unknown) {
  if (error instanceof GovernanceError) return { error: error.code, message: error.message, status: error.status };
  return { error: "internal_error", message: "Internal error", status: 500 };
}
export function governanceErrorResponse(error: unknown) {
  const auth = authErrorResponse(error);
  if (auth) return auth;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "conflict" }, { status: 409 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  const known = governanceError(error);
  return NextResponse.json({ error: known.error, message: known.message }, { status: known.status });
}
