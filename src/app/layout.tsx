import type { Metadata } from "next";
import "./globals.css"; // Keep this if you have global styles

export const metadata: Metadata = {
  title: {
    default: "YAT?STATS Microsites",
    template: "%s | YAT?STATS",
  },
  description: "YAT?STATS school microsites",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
