export type Principal = {
  subject: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  source: "development" | "tidecloak" | "tidecloak-sim";
  /** Realm roles plus this client's roles, read from the verified token (development mode: Tide defaults). */
  roles: string[];
};

/** Modes with no Tide fabric: the vault uses the local demo cipher (not E2EE). */
export function usesLocalCipher(mode: string | undefined) {
  return mode === "development" || mode === "tidecloak-sim";
}
