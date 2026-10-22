"use client";

import { TideCloakProvider } from "@tidecloak/nextjs";
import type { ReactNode } from "react";
import { getTideClientConfig } from "@/lib/tide/config";

const tideEnabled = process.env.NEXT_PUBLIC_AUTH_MODE === "tidecloak";
const tideConfig = tideEnabled ? getTideClientConfig() : null;

export function TideProvider({ children }: { children: ReactNode }) {
  if (!tideConfig) return children;
  return <TideCloakProvider config={tideConfig}>{children}</TideCloakProvider>;
}
