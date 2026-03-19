import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getPlayerById } from "@/lib/db";
import { toPlayerSlug } from "@/lib/slug";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hsid: string; playerId: string }>;
}): Promise<Metadata> {
  try {
    const { playerId } = await params;
    const player = await getPlayerById(String(playerId));
    const playerName = player ? `${player.firstname || ""} ${player.lastname || ""}`.trim() : "Player";
    return {
      title: `${playerName.toUpperCase()} | YAT?STATS - Player Profile`,
      description: `Full career stats and profile for ${playerName}.`,
    };
  } catch {
    return {
      title: "Player Profile | YAT?STATS",
      description: "Player profile on YAT?STATS.",
    };
  }
}

export default async function PlayerProfileRedirect({
  params,
}: {
  params: Promise<{ hsid: string; playerId: string }>;
}) {
  const { hsid, playerId } = await params;
  const player = await getPlayerById(String(playerId));
  if (!player) notFound();
  const slug = toPlayerSlug(player.firstname, player.lastname);
  permanentRedirect(`/${hsid}/player/${playerId}/${slug}`);
}
