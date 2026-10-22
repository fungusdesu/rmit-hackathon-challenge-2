"use client";

import { TideCloakProvider } from "@tidecloak/nextjs";
import type { ReactNode } from "react";
import { getTideClientConfig } from "@/lib/tide/config";

export function TideProvider({ children }: { children: ReactNode }) {
  const enabled = process.env.NEXT_PUBLIC_AUTH_MODE === "tidecloak";
  if (!enabled) return children;
  return <TideCloakProvider config={getTideClientConfig()}>{children}</TideCloakProvider>;
}
