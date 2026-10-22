export type Principal = {
  subject: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  source: "development" | "tidecloak";
};
