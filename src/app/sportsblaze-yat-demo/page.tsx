// src/app/sportsblaze-yat-demo/page.tsx
// Server-rendered proof route for SportsBlaze inside the YAT?STATS experience.

import SportsBlazeNowLayerDemo from "@/components/yatstats/SportsBlazeNowLayerDemo";
import { getSportsBlazeHamiltonWatch } from "@/lib/sportsblaze";

export const dynamic = "force-dynamic";

export default async function SportsBlazeYatDemoPage() {
  const activity = await getSportsBlazeHamiltonWatch({
    league: "nfl",
    date: "2025-02-09",
    hsid: "5004",
  });

  return <SportsBlazeNowLayerDemo activity={activity} />;
}
