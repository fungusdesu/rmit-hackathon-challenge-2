import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BusinessVault",
  description: "Governance infrastructure for shared business assets.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
