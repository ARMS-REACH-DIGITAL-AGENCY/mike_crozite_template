// Read-only, preview-only historical Stat Ledger for ONE frozen 2026 game.
// The 2026 scores and matchups are authoritative frozen artifacts. Recompute
// only the selected game's player lines using the existing 2027 scoring engine;
// never replay 15,368 games for each drawer, and never write to production.
import { NextRequest, NextResponse } from 'next/server';
import { fetchBracketLiveBatches } from '@/lib/bracket/fetchLiveBatches';
import { scoreLive } from '@/components/bracket/liveSeason';
import { rebaseReplayWeek } from './rebaseReplayWeek';
import type { GameBox, GameRow, Index, LbGame, SeriesRow } from '@/components/bracket/gallery';
import frozenIndex from '../../../../public/replay-2026/index.json';
import frozenLbA from '../../../../public/replay-2026/lb-a.json';
import frozenLbB from '../../../../public/replay-2026/lb-b.json';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const INDEX = frozenIndex as unknown as Index;
const LB = [...(frozenLbA as unknown as LbGame[]), ...(frozenLbB as unknown as LbGame[])];
const ORIGINAL_START = INDEX.weeks[0][0];
type Match = { game: GameRow; series?: SeriesRow };
const gameMap = new Map<number, Match>();

function add(game: GameRow, series?: SeriesRow) {
  if (gameMap.has(game[0])) throw new Error('Duplicate frozen game ID ' + game[0]);
  gameMap.set(game[0], { game, series });
}
for (const round of INDEX.rounds) for (const series of round.series) for (const g of series[7]) add(g, series);
for (const game of LB) add(game.slice(0, 7) as GameRow);
for (const t of INDEX.lbt) add(t.game);
for (const g of INDEX.gf) add(g);
if (gameMap.size !== 15368 || INDEX.weeks.length !== 34 || Object.keys(INDEX.schools).length !== 1024)
  throw new Error('Incomplete frozen 2026 replay: do not substitute new matchups or scores');

const cache = new Map<number, Promise<GameBox>>();
function after(iso: string) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function buildBox(gameId: number): Promise<GameBox> {
  const match = gameMap.get(gameId);
  if (!match) throw new Error('Historical replay game not found');
  const locked = match.game;
  const week = locked[1];
  const [home, away] = [locked[2], locked[3]];
  const end = INDEX.weeks[week - 1]?.[1];
  if (!home || !away || !end) throw new Error('Frozen replay game is incomplete');

  // Request the selected game's seven-day source window, never all earlier
  // weeks. A Round 10 click must not read 30 weeks of unrelated game logs.
  // Rebase the returned day offsets onto the frozen 34-week tournament clock.
  const weekStart = INDEX.weeks[week - 1][0];
  const offsetDays = Math.round((Date.parse(weekStart + 'T00:00:00Z') -
    Date.parse(ORIGINAL_START + 'T00:00:00Z')) / 86400000);
  let recent: Awaited<ReturnType<typeof fetchBracketLiveBatches>> | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      recent = await fetchBracketLiveBatches(
        'https://hamilton.az.yatstats.com', weekStart, 1, [home, away]
      );
      break;
    } catch (error) {
      if (attempt === 1) throw error;
      console.warn('[2026 replay game Stat Ledger] retrying bounded historical week', gameId, week);
    }
  }
  if (!recent) throw new Error('Historical week data unavailable');
  const live = rebaseReplayWeek(recent, offsetDays, week);
  const copy = [...locked.slice(0, 5), [...locked[5]], locked[6]] as GameRow;
  const seedHome = match.series?.[3] ?? INDEX.schools[home]?.[2] ?? 0;
  const seedAway = match.series?.[4] ?? INDEX.schools[away]?.[2] ?? 0;
  const series: SeriesRow = [
    INDEX.schools[home]?.[1] ?? 0, home, away, seedHome, seedAway,
    locked[6] ?? 0, [0, 0], [copy],
  ];
  const isolated: Index = {
    ...INDEX,
    rounds: [{ r: Math.ceil(week / 3), name: 'Frozen historical game', start: INDEX.weeks[week - 1][0], end, series: [series] }],
    lbt: [], gf: [],
  };
  const box = scoreLive(isolated, live, after(end))[String(gameId)];
  if (!box || box.h?.days?.length !== 7 || box.a?.days?.length !== 7 || box.d?.length !== 8)
    throw new Error('Historical game is missing its weekly or daily statistics');

  // Never attach statistics that could explain a DIFFERENT final score.
  // Auto-ruling tiebreaks can depend on earlier series games, so validate
  // the original nine scoring innings, not any later commissioner tiebreak.
  if (JSON.stringify(copy[5].slice(0, 18)) !== JSON.stringify(locked[5].slice(0, 18))) {
    throw new Error('Historical scoring source differs from the frozen result for game ' + gameId);
  }
  return box;
}
export async function GET(req: NextRequest) {
  if (process.env.VERCEL_ENV === 'production')
    return NextResponse.json({ error: 'Preview only' }, { status: 404 });
  const raw = req.nextUrl.searchParams.get('game') || '';
  const gameId = /^\d{1,5}$/.test(raw) ? Number(raw) : 0;
  if (!gameMap.has(gameId)) return NextResponse.json({ error: 'Unknown frozen 2026 game' }, { status: 404 });
  try {
    let task = cache.get(gameId);
    if (!task) {
      task = buildBox(gameId).catch((error) => { cache.delete(gameId); throw error; });
      cache.set(gameId, task);
    }
    const box = await task;
    return NextResponse.json({ gameId, box }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (error) {
    console.error('[2026 replay game Stat Ledger]', gameId, error);
    return NextResponse.json({ error: 'Historical Stat Ledger unavailable for this game' }, { status: 503 });
  }
}
