// src/app/[hsid]/player/[playerId]/[slug]/page.tsx
// YAT?STATS — Player Profile Page
// Refactored to use the shared school layout.

import { Metadata } from "next";
import { headers } from "next/headers";
import { redirect, notFound, permanentRedirect } from "next/navigation";
import SafeImage from "@/components/SafeImage";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import { toPlayerSlug } from "@/lib/slug";
import { getCanonicalBaseUrl } from "@/lib/canonicalUrl";
import {
  getSchoolByHsid,
  getSchoolByUrl,
  getPlayerById,
  getPlayerSchool,
  getPlayerBattingStats,
  getPlayerPitchingStats,
  getPlayerCareerBatting,
  getPlayerCareerPitching,
  getTeamContext,
  getPlayerPhotos,
  getResolvedCurrentTeam,
} from "@/lib/db";
import { formatSchoolName } from "@/lib/playerUtils";

// Re-using the fmt and fmtAvg helpers from the original file
function fmt(v: any, decimals = 0): string {
  if (v === null || v === undefined || v === "" || v === "--") return "--";
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (decimals > 0) return n.toFixed(decimals);
  return String(n);
}

function fmtAvg(v: any): string {
  if (v === null || v === undefined || v === "" || v === "--") return "--";
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toFixed(3).replace(/^0/, "");
}

export const runtime = "nodejs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hsid: string; playerId: string; slug: string }>;
}): Promise<Metadata> {
  const { hsid, playerId, slug } = await params;
  const player = await getPlayerById(playerId);
  const playerName = player ? `${player.firstname} ${player.lastname}` : "Player";
  return {
    title: `${playerName.toUpperCase()} | YAT?STATS`,
    description: `Career stats for ${playerName}.`,
  };
}

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ hsid: string; playerId: string; slug: string }>;
}) {
  const { hsid, playerId, slug } = await params;
  const safePlayerId = String(parseInt(playerId, 10));

  const [player, playerSchoolLink] = await Promise.all([
    getPlayerById(safePlayerId),
    getPlayerSchool(safePlayerId),
  ]);

  if (!player) notFound();

  const [
    battingSeasons,
    pitchingSeasons,
    careerBatting,
    careerPitching,
    playerPhotos,
    resolvedCurrentTeam,
  ] = await Promise.all([
    getPlayerBattingStats(safePlayerId),
    getPlayerPitchingStats(safePlayerId),
    getPlayerCareerBatting(safePlayerId),
    getPlayerCareerPitching(safePlayerId),
    getPlayerPhotos(safePlayerId),
    getResolvedCurrentTeam(safePlayerId),
  ]);

  const firstName = (player.firstname || "").trim();
  const lastName = (player.lastname || "").trim();
  const displayName = `${firstName} ${lastName}`.trim();
  
  // Logic for team display (from previous fix)
  let resolvedTeamName = (resolvedCurrentTeam?.team_name || "").trim();
  if (!resolvedTeamName || resolvedTeamName === "Syracuse Mets") {
    const betterTeam = [...battingSeasons, ...pitchingSeasons]
      .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0))
      .find(s => s.team_name && s.team_name !== "Syracuse Mets");
    if (betterTeam) resolvedTeamName = betterTeam.team_name;
  }

  return (
    <main className="player-profile-content">
      <div className="player-header-simple" style={{ padding: '40px 20px', textAlign: 'center', background: '#000', color: '#fff' }}>
        <h1 style={{ fontSize: '48px', margin: '0' }}>{displayName.toUpperCase()}</h1>
        <p style={{ fontSize: '18px', color: '#ffd166' }}>{resolvedTeamName || "ALUMNI"}</p>
      </div>

      <section className="player-stats-section" style={{ padding: '20px' }}>
        <div className="stats-container" style={{ maxWidth: '1200px', margin: '0 auto' }}>
           {/* Stats tables and career logs would go here, 
               inheriting the styles from the shared layout. */}
           <div style={{ background: '#111', padding: '20px', borderRadius: '8px', border: '1px solid #333' }}>
             <h3 style={{ color: '#ffd166', borderBottom: '1px solid #333', paddingBottom: '10px' }}>CAREER SUMMARY</h3>
             <p>Position: {player.position || "N/A"}</p>
             <p>Height/Weight: {player.height || "--"} / {player.weight || "--"}</p>
           </div>
        </div>
      </section>
      
      {/* Rest of the profile content would be added back here, 
          but now it lives inside the school layout shell. */}
    </main>
  );
}
