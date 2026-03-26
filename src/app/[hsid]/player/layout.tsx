// src/app/[hsid]/player/layout.tsx
// Intentionally minimal.
// The real shared shell already comes from src/app/[hsid]/layout.tsx.
// Do NOT render another header, school row, tabs, drawer shell, or footer here.

import type { ReactNode } from "react";

export default function PlayerRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
