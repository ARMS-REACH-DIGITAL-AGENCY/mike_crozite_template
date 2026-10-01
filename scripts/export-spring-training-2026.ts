// scripts/export-spring-training-2026.ts
// Read-only export for the bracket simulator: every linked player's 2026
// MLB spring training lines (MLB Stats API, gameType S, sportId 1). Nothing
// is written to the database - spring training stays off the Game Log; the
// bracket simulator decides whether these lines count.
//
// Prints a summary, then the lines (gzip + base64 between markers) in the
// simulator's pro_bat.csv / pro_pit.csv formats with level 'SPRING'.
//
// Usage: npx tsx scripts/export-spring-training-2026.ts
// Env: DATABASE_URL.

import { Pool } from 'pg';
import { gzipSync } from 'node:zlib';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';
const SEASON = 2026;
const CONCURRENCY = 6;

type Split = { date?: string; team?: { id?: number }; stat?: Record<string, unknown> };
const n = (s: Record<string, unknown> | undefined, k: string) => {
  const v = Number(s?.[k]);
  return Number.isFinite(v) ? v : 0;
};

async function gameLog(personId: string, group: 'hitting' | 'pitching'): Promise<Split[]> {
  const url = `${MLB_API_BASE}/people/${personId}/stats?stats=gameLog&group=${group}&season=${SEASON}&sportId=1&gameType=S`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { stats?: { splits?: Split[] }[] };
      return data.stats?.find((s) => s.splits?.length)?.splits ?? [];
    } catch (error) {
      if (attempt === 2) console.error(`gameLog ${personId} ${group}:`, error);
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return [];
}

async function main() {
  const { rows: players } = await pool.query<{ playerid: string; person_id: string; hsid: string }>(
    `SELECT DISTINCT m.playerid::text AS playerid, m.source_player_id AS person_id, f.hsid::text AS hsid
       FROM public.player_source_map m
       JOIN LATERAL (SELECT hsid FROM public.flip_card_front_stage f WHERE f.playerid::text = m.playerid::text AND f.hsid::text ~ '^\\d+$' LIMIT 1) f ON true
      WHERE m.source = 'mlb_api'
        AND m.match_method IS DISTINCT FROM 'rejected_bad_identity_match'`
  );
  console.log(`Linked players: ${players.length}`);

  const bat: string[] = [];
  const pit: string[] = [];
  let withGames = 0;
  let next = 0;
  async function worker() {
    while (next < players.length) {
      const p = players[next++];
      const [h, pi] = await Promise.all([gameLog(p.person_id, 'hitting'), gameLog(p.person_id, 'pitching')]);
      if (h.length || pi.length) withGames++;
      for (const s of h) {
        const st = s.stat;
        bat.push([p.playerid, p.hsid, s.date, 'SPRING', s.team?.id ?? '', n(st, 'plateAppearances'), n(st, 'atBats'), n(st, 'hits'), n(st, 'doubles'), n(st, 'triples'), n(st, 'homeRuns'), n(st, 'baseOnBalls'), n(st, 'hitByPitch'), n(st, 'sacFlies')].join(','));
      }
      for (const s of pi) {
        const st = s.stat;
        pit.push([p.playerid, p.hsid, s.date, 'SPRING', s.team?.id ?? '', n(st, 'outs'), n(st, 'battersFaced'), n(st, 'homeRuns'), n(st, 'baseOnBalls'), n(st, 'hitBatsmen'), n(st, 'strikeOuts'), n(st, 'earnedRuns'), n(st, 'hits')].join(','));
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const dates = [...bat, ...pit].map((l) => l.split(',')[2]).sort();
  console.log(`Players with spring games: ${withGames}; batting lines ${bat.length}; pitching lines ${pit.length}; dates ${dates[0]} to ${dates[dates.length - 1]}`);

  const payload = gzipSync(Buffer.from(JSON.stringify({ bat: bat.join('\n'), pit: pit.join('\n') }))).toString('base64');
  console.log('BEGIN_SPRING_DATA');
  for (let i = 0; i < payload.length; i += 4000) console.log(`SPRING ${payload.slice(i, i + 4000)}`);
  console.log('END_SPRING_DATA');
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exit(1);
});
