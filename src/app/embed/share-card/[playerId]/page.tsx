// Isolated, fully server-rendered front card for social image export.
// This uses the SAME PlayerCardFront component as the published gallery
// and the Contribute drawer proof. No school-page chrome or image recreation.
import { notFound } from "next/navigation";
import { getActiveRosterRowByPlayerId, getBatchDesignatedPlayerImages, getFlipCardFrontStageByPlayerId } from "@/lib/db";
import PlayerCardFront from "@/components/yatstats/PlayerCardFront";
import YatStyles from "@/components/yatstats/YatStyles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
const ID = /^[A-Za-z0-9_-]{1,40}$/;

export default async function ShareCardRenderPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  if (!ID.test(playerId)) notFound();

  const [stageRow, activeRow, images] = await Promise.all([
    getFlipCardFrontStageByPlayerId(playerId),
    getActiveRosterRowByPlayerId(playerId).catch(() => null),
    getBatchDesignatedPlayerImages([playerId], "YATSTATS_FRONT"),
  ]);
  if (!stageRow) notFound();

  // Match the published gallery merge, retaining the authoritative staged
  // status/commitment even when a statistical row is available.
  const player: Record<string, unknown> = activeRow
    ? {
        ...stageRow,
        ...activeRow,
        status_label: stageRow.status_label,
        display_status_label: stageRow.display_status_label,
        resolved_committed_team_name: stageRow.resolved_committed_team_name,
        resolved_committed_team_short_name: stageRow.resolved_committed_team_short_name,
      }
    : { ...stageRow };

  return (
    <>
      <YatStyles />
      <main data-share-card-root="true" className="ypf-real-flip-preview yat-share-card-only">
        <article className="yat-card" data-playerid={playerId}>
          <div className="yat-card-inner">
            <div className="yat-flip">
              <PlayerCardFront
                player={player}
                frontImageUrl={images.get(playerId)?.image_url ?? null}
                hsid={String(stageRow.hsid || "")}
                eager
              />
            </div>
          </div>
        </article>
      </main>
      <style>{`
        /* The same 5:7 card surface / 140% frame as ContributeProof.
           Only the surrounding proof controls are intentionally omitted. */
        html, body { margin:0!important; padding:0!important; width:300px!important; min-width:0!important; height:420px!important; min-height:0!important; overflow:hidden!important; }
        .yat-share-card-only { position:relative!important; width:300px!important; height:420px!important; min-width:300px!important; max-width:300px!important; padding:0!important; margin:0!important; background:transparent!important; overflow:visible!important; }
        .yat-share-card-only .yat-card { display:block!important; width:300px!important; height:420px!important; aspect-ratio:5/7; margin:0!important; padding:0!important; }
        .yat-share-card-only .yat-card::before { padding-top:140%; }
        .yat-share-card-only .yat-card .yat-face * { pointer-events:none!important; }
        .yat-share-card-only .yat-player-card-share { display:none!important; }
        .yat-share-card-only .yat-face { border-radius:0; }
        .yat-share-card-only *, .yat-share-card-only *::before, .yat-share-card-only *::after { animation:none!important; transition:none!important; }
      `}</style>
    </>
  );
}
