import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "YAT?STATS",
    template: "%s | YAT?STATS",
  },
  description: "YAT?STATS school microsites — Track active and all-time baseball alumni.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
