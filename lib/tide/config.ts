import type { TidecloakConfig } from "@tidecloak/nextjs/server";

export function getTideConfig(): TidecloakConfig | null {
  const authServerUrl = process.env.TIDECLOAK_AUTH_SERVER_URL;
  const realm = process.env.TIDECLOAK_REALM;
  const clientId = process.env.TIDECLOAK_CLIENT_ID;

  if (!authServerUrl || !realm || !clientId) return null;

  return {
    "auth-server-url": authServerUrl,
    realm,
    resource: clientId,
    "public-client": true,
    tokenSignatureAlgorithms: ["EdDSA", "ES256", "ES384", "ES512"],
  };
}

export function getTideClientConfig() {
  return {
    "auth-server-url": process.env.NEXT_PUBLIC_TIDECLOAK_AUTH_SERVER_URL ?? "",
    realm: process.env.NEXT_PUBLIC_TIDECLOAK_REALM ?? "",
    resource: process.env.NEXT_PUBLIC_TIDECLOAK_CLIENT_ID ?? "",
    "public-client": true,
    redirectUri: process.env.NEXT_PUBLIC_TIDECLOAK_REDIRECT_URI ?? undefined,
  };
}
