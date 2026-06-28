import type { ReactNode } from "react";

export const metadata = {
  title: "BandageBoard — Wound-Care Billing",
  description: "Internal biller-facing wound-care billing triage",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
