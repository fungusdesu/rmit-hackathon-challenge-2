export type Principal = {
  subject: string;
  displayName: string;
  email: string | null;
  source: "development" | "tidecloak";
};
