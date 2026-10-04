import {
  getActiveRosterByHsid,
  getBatchDesignatedPlayerImages,
  getFlipCardFrontStageByHsid,
} from "@/lib/db";
import { sortActivePlayers, isRetiredAtHighSchoolLevel } from "@/lib/playerUtils";
import PlayerCard from "@/components/yatstats/PlayerCard";

export async function generateMetadata() {
  return {
    title: "Connect & Contribute | YAT?STATS",
    description: "Upload photos and contribute to your school's baseball community.",
  };
}

type Row = Record<string, unknown>;
const asRows = (r: unknown): Row[] => (Array.isArray(r) ? (r as Row[]) : []);

export default async function ConnectContributePage({ params }: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await params;

  const [activeRosterResult, flipFrontStageResult] = await Promise.all([
    getActiveRosterByHsid(hsid).catch(() => []),
    getFlipCardFrontStageByHsid(hsid).catch(() => []),
  ]);

  const activeRosterRows = asRows(activeRosterResult);
  const stageRows = asRows(flipFrontStageResult).filter((p) => !isRetiredAtHighSchoolLevel(p));
  const stageMap = new Map(stageRows.map((p) => [String(p.playerid), p]));

  const activeMerged: Row[] = [];
  for (const p of activeRosterRows) {
    const id = String(p.playerid);
    const stageRow = stageMap.get(id);
    activeMerged.push(stageRow ? { ...stageRow, ...p } : { ...p });
  }
  const sorted = sortActivePlayers(activeMerged);
  const threePlayers = sorted.slice(0, 3);
  const playerIds = threePlayers.map((p) => String(p.playerid));

  const [frontImageMap, headshotMap] = await Promise.all([
    playerIds.length
      ? getBatchDesignatedPlayerImages(playerIds, "YATSTATS_FRONT").catch(() => new Map<string, any>())
      : Promise.resolve(new Map<string, any>()),
    playerIds.length
      ? getBatchDesignatedPlayerImages(playerIds, "HEADSHOT").catch(() => new Map<string, any>())
      : Promise.resolve(new Map<string, any>()),
  ]);

  const shareBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://yatstats.com";

  return (
    <div className="yat-grid" style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '16px', padding: '16px',
    }}>
      {threePlayers.map((p) => {
        const pid = String(p.playerid);
        return (
          <PlayerCard
            key={pid}
            player={p}
            resolvedHsid={hsid}
            frontImageUrl={frontImageMap.get(pid)?.image_url ?? null}
            headshotUrl={headshotMap.get(pid)?.image_url ?? null}
            shareBaseUrl={shareBaseUrl}
            schoolName=""
            schoolLocation=""
          />
        );
      })}
    </div>
  );
}
