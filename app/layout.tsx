import type { Metadata } from "next";
import "./globals.css";
import { TideProvider } from "./tide-provider";

export const metadata: Metadata = {
  title: "BusinessVault",
  description: "Governance infrastructure for shared business assets.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><TideProvider>{children}</TideProvider></body>
    </html>
  );
}
