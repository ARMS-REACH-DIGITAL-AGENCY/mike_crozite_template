import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { 
  getPlayerById, 
  getSchoolByHsid, 
  getPlayerBattingStats, 
  getPlayerPitchingStats, 
  getPlayerCareerBatting, 
  getPlayerCareerPitching, 
  getPlayerPhotos, 
  getResolvedCurrentTeam 
} from "@/lib/db";
import { 
  Trophy, 
  Calendar, 
  MapPin, 
  User, 
  Star
} from "lucide-react";

interface PlayerPageProps {
  params: Promise<{
    hsid: string;
    playerId: string;
    slug: string;
  }>;
}

export async function generateMetadata({ params }: PlayerPageProps): Promise<Metadata> {
  const { playerId } = await params;
  const player = await getPlayerById(playerId);
  if (!player) return { title: "Player Not Found" };

  const name = `${player.firstname || ""} ${player.lastname || ""}`.trim();
  return {
    title: `${name} | YAT?STATS`,
    description: `View stats, bio, and career history for ${name}.`,
  };
}

export default async function PlayerPage({ params }: PlayerPageProps) {
  const { hsid, playerId } = await params;
  const safePlayerId = String(parseInt(playerId, 10));

  const [
    player, 
    school,
    battingSeasons,
    pitchingSeasons,
    careerBatting,
    careerPitching,
    playerPhotos,
    resolvedCurrentTeam,
  ] = await Promise.all([
    getPlayerById(safePlayerId),
    getSchoolByHsid(hsid),
    getPlayerBattingStats(safePlayerId),
    getPlayerPitchingStats(safePlayerId),
    getPlayerCareerBatting(safePlayerId),
    getPlayerCareerPitching(safePlayerId),
    getPlayerPhotos(safePlayerId),
    getResolvedCurrentTeam(safePlayerId),
  ]);

  if (!player) {
    notFound();
  }

  const displayName = `${player.firstname || ""} ${player.lastname || ""}`.trim();

  // TEAM DISPLAY LOGIC: Prioritize resolved/enriched data
  let teamDisplayName = (resolvedCurrentTeam?.team_name || "").trim();
  if (!teamDisplayName || teamDisplayName === "Syracuse Mets") {
    const allSeasons = [...(battingSeasons || []), ...(pitchingSeasons || [])];
    const betterTeam = allSeasons
      .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0))
      .find(s => s.team_name && s.team_name !== "Syracuse Mets");
    if (betterTeam) teamDisplayName = betterTeam.team_name;
  }
  if (!teamDisplayName) teamDisplayName = "Alumni";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Hero Section */}
      <div className="relative bg-[#111] border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Player Headshot */}
            <div className="relative w-48 h-48 rounded-full overflow-hidden border-4 border-white/20 bg-black flex-shrink-0">
              {player.headshot_url ? (
                <Image
                  src={player.headshot_url}
                  alt={displayName}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                  <User className="w-20 h-20 text-zinc-600" />
                </div>
              )}
            </div>

            {/* Player Info */}
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 text-zinc-400 mb-2">
                <MapPin className="w-4 h-4" />
                <span className="text-sm uppercase tracking-wider">{school?.city}, {school?.state}</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-2">
                {player.firstname} <span className="text-white/60">{player.lastname}</span>
              </h1>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-white/5">
                  <span className="text-sm font-bold text-white">{teamDisplayName}</span>
                  <span className="w-1 h-1 bg-white/30 rounded-full" />
                  <span className="text-sm text-zinc-400">{player.position || 'P'}</span>
                </div>
                <div className="text-sm text-zinc-400">
                  Class of {player.grad_year || '2021'}
                </div>
              </div>
            </div>

            {/* Favorite Button */}
            <button className="flex items-center gap-2 px-6 py-3 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition-colors">
              <Star className="w-5 h-5" />
              FAVORITE
            </button>
          </div>
        </div>
      </div>

      {/* Career Progression Strip */}
      <div className="bg-black py-8 border-b border-white/5 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'HIGH SCHOOL', team: 'Hamilton', year: player.grad_year },
              { label: 'COLLEGE', team: player.college_name || 'Dallas Baptist', year: '2021' },
              { label: 'DRAFTED', team: 'NYM', year: '2021' },
              { label: 'PRO', team: 'St. Lucie', year: '2022' },
              { label: 'NOW', team: teamDisplayName, year: '2025', active: true }
            ].map((slot, i) => (
              <div key={i} className={`p-4 rounded-lg border ${slot.active ? 'border-white/20 bg-white/5' : 'border-white/5 bg-transparent'}`}>
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">{slot.label}</div>
                <div className="text-sm font-black truncate">{slot.team}</div>
                <div className="text-xs text-zinc-400">{slot.year}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs / Content */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex gap-8 border-b border-white/10 mb-8 overflow-x-auto pb-1">
          {['GAME LOG', 'STATS', 'NEWS & VIDEOS', 'SOCIAL MEDIA', 'PHOTO GALLERY'].map((tab) => (
            <button key={tab} className={`text-sm font-bold whitespace-nowrap pb-4 border-b-2 transition-colors ${tab === 'GAME LOG' ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-white'}`}>
              {tab}
            </button>
          ))}
        </div>

        {/* Game Log Section */}
        <div className="bg-[#111] rounded-xl border border-white/10 overflow-hidden">
          <div className="p-6 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              GAME LOG
            </h2>
            <div className="text-sm text-zinc-400">{teamDisplayName}</div>
          </div>
          <div className="p-12 text-center">
            <div className="text-zinc-500 mb-4 italic">Schedule not yet available for this team.</div>
            <button className="text-sm font-bold text-white/40 hover:text-white transition-colors underline underline-offset-4">
              VIEW HISTORICAL STATS
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
