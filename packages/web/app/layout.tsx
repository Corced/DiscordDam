import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DiscordGate", template: "%s — DiscordGate" },
  description: "Members-only API access gated by Discord membership.",
  // Members-only site — nothing gets indexed.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#313338] text-white antialiased">{children}</body>
    </html>
  );
}