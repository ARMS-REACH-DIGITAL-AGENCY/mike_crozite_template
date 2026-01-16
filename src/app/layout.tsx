import type { Metadata } from "next";
import { GeistSans, GeistMono } from "next/font/google"; // Keep your font imports
import "./globals.css"; // Keep if you have global styles

const geistSans = GeistSans({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const geistMono = GeistMono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
