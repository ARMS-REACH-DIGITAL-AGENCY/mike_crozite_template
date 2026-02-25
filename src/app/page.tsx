// src/app/page.tsx
// Root route — redirect to main yatstats.com homepage
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("https://yatstats.com");
}
