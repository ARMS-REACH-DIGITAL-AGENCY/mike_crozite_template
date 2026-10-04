import {
  getSchoolByHsid,
  getActiveRosterByHsid,
  getBatchDesignatedPlayerImages,
  getFlipCardFrontStageByHsid,
} from "@/lib/db";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import { sortActivePlayers, isRetiredAtHighSchoolLevel } from "@/lib/playerUtils";
import PlayerCard from "@/components/yatstats/PlayerCard";
import ContributeClient from "./ContributeClient";

export async function generateMetadata({ params }: { params: Promise<{ hsid: string }> }) {
  return {
    title: "Connecting Contribute | YAT?STATS",
    description:
      "Share photos, news tips, and stories about your school's baseball alumni.",
  };
}

type Row = Record<string, unknown>;
const asRows = (r: unknown): Row[] => (Array.isArray(r) ? (r as Row[]) : []);

export default async function ContributeConnectPage({ params }: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await params;
  const school = (await getSchoolByHsid(hsid).catch(() => null)) as Row | null;
  const resolvedHsid = String(school?.hsid ?? hsid);
  const schoolName = String(school?.hsname ?? "School");

  // Fetch active roster and images (same as homepage)
  const [activeRosterResult, flipFrontStageResult] = await Promise.all([
    getActiveRosterByHsid(resolvedHsid).catch(() => []),
    getFlipCardFrontStageByHsid(resolvedHsid).catch(() => []),
  ]);

  const activeRosterRows = asRows(activeRosterResult);
  const stageRows = asRows(flipFrontStageResult).filter((p) => !isRetiredAtHighSchoolLevel(p));
  const stageMap = new Map(stageRows.map((p) => [String(p.playerid), p]));

  const activeMerged: Row[] = [];
  const seenIds = new Set<string>();
  for (const p of activeRosterRows) {
    const id = String(p.playerid);
    const stageRow = stageMap.get(id);
    activeMerged.push(stageRow ? { ...stageRow, ...p } : { ...p });
    seenIds.add(id);
  }
  const sorted = sortActivePlayers(activeMerged);
  const threePlayers = sorted.slice(0, 3);
  const playerIds = threePlayers.map((p) => String(p.playerid));

  // Get images for the 3 players
  const [frontImageMap, headshotMap] = await getBatchDesignatedPlayerImages(playerIds).catch(
    () => [new Map(), new Map()] as const
  );

  const crestUrl = getSchoolCrestUrl(resolvedHsid);
  const shareBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://yatstats.com";

  // Headshot strip data (first 12 for the strip)
  const stripPlayers = sorted.slice(0, 12);

  return (
    <ContributeClient
      hsid={resolvedHsid}
      schoolName={schoolName}
      crestUrl={crestUrl}
      players={threePlayers}
      stripPlayers={stripPlayers}
      frontImageMap={Object.fromEntries(frontImageMap)}
      headshotMap={Object.fromEntries(headshotMap)}
      shareBaseUrl={shareBaseUrl}
    />
  );
}
