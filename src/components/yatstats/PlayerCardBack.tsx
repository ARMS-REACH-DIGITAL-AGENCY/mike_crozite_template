// src/components/yatstats/PlayerCardBack.tsx
// Back face of the flip card — profile-lite layout
// Blocks:
// 1) linked identity header
// 2) metadata band
// 3) hot links
// 4) active content (stats for now)
// 5) footer

import SafeImage from "@/components/SafeImage";
import { fmt, parseDraft } from "@/lib/playerUtils";
import { getNowSilhouetteUrl } from "@/lib/playerImage";

interface PlayerCardBackProps {
  player: Record<string, unknown>;
  resolvedHsid: string;
  headshotUrl: string | null;
  isAllTime?: boolean;
}

export default function PlayerCardBack({
  player: p,
  resolvedHsid,
  headshotUrl,
  isAllTime,
}: PlayerCardBackProps) {
  const isPitcher = p.is_pitcher === true;
  const slug = String(p.slug || "");
  const playerId = String(p.playerid || "");
  const profileHref = `/${resolvedHsid}/player/${playerId}/${slug
