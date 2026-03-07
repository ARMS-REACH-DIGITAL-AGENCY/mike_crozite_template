import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPlayerById } from "@/lib/db";
import { toPlayerSlug } from "@/lib/slug";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hsid: string; playerId: string }>;
}): Promise<Metadata> {
  const { playerId } = await params;
  const player = await getPlayerById(String(playerId));
  const playerName = player ? `${player.firstname || ""} ${player.lastname || ""}`.trim() : "Player";
  return {
    title: `${playerName.toUpperCase()} | YAT?STATS - Player Profile`,
    description: `Full career stats and profile for ${playerName}.`,
  };
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
  redirect(`/${hsid}/player/${playerId}/${slug}`);
}
