// Live bracket box score transformer.
// Transforms ingested Neon data (player_game_logs, TBC, etc.) into the bracket
// box format that the frontend expects.
//
// Date-gated: only returns real data on/after 2027-02-01 (bracket season start).
// Use ?preview=1 to bypass the gate for testing with live data.
//
// GET params:
//   home: home school hsid
//   away: away school hsid
//   date: YYYY-MM-DD (the Monday of the week, defaults to current week Monday)
//   preview: 1 to bypass the Feb 2027 gate
//
// Returns bracket box format:
//   { d: [[h_ops+, a_ops+, h_fip-, a_fip-], ... 8 entries], h: {p: [...], wl: [...]}, a: {...} }

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

const SEASON_START = '2027-02-01';

// Simplified OPS+ computation: 100 * (OPS / leagueAvgOPS)
// In production, this would use park-adjusted league averages.
function computeOpsPlus(pa: number, hits: number, doubles: number, triples: number, hr: number, bb: number, hbp: number, sf: number, ab: number): number | null {
  if (ab === 0) return null;
  const singles = hits - doubles - triples - hr;
  const tb = singles + 2 * doubles + 3 * triples + 4 * hr;
  const obpNum = hits + bb + hbp;
  const obpDen = ab + bb + hbp + sf;
  if (obpDen === 0) return null;
  const obp = obpNum / obpDen;
  const slg = tb / ab;
  const ops = obp + slg;
  // League average OPS ~ .720; scale to 100
  return Math.round(100 * (ops / 0.72));
}

// Simplified FIP-: 100 * (leagueAvgFIP / FIP), lower is better so inverted.
// FIP = ((13*HR + 3*(BB+HBP) - 2*K) / IP) + constant (~3.10)
function computeFipMinus(ip: number, hr: number, bb: number, hbp: number, k: number): number | null {
  if (ip === 0) return null;
  const fip = ((13 * hr + 3 * (bb + hbp) - 2 * k) / ip) + 3.10;
  if (fip <= 0) return null;
  // League average FIP ~ 4.20; scale to 100 (inverted: lower FIP = higher FIP- is wrong, actually lower FIP = better = lower FIP-)
  // FIP- is like ERA-: 100 is average, lower is better.
  return Math.round(100 * (fip / 4.20));
}

type PlayerGameLog = {
  playerid: string;
  game_date: string;
  stat_type: string;
  stats: any;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const homeHsid = searchParams.get('home');
    const awayHsid = searchParams.get('away');
    const dateStr = searchParams.get('date');
    const startStr = searchParams.get('start');
    const endStr = searchParams.get('end');
    const preview = searchParams.get('preview') === '1';

    if (!homeHsid || !awayHsid) {
      return NextResponse.json({ error: 'home and away hsids required' }, { status: 400 });
    }



    // Date gate: only serve real data on/after the 2027 season start.
    const today = new Date().toISOString().slice(0, 10);
    const asof = dateStr || today;
    if (!preview && asof < SEASON_START) {
      return NextResponse.json({
        status: 'not_started',
        message: `Bracket season starts ${SEASON_START}`,
      });
    }

    // The test brackets can pass an explicit 7-day window (Oct 2-8, etc.).
    // Production callers that omit start/end retain the Monday-Sunday behavior.
    let weekStart: string;
    let weekEndStr: string;
    let monday: Date;
    if (startStr && endStr) {
      weekStart = startStr;
      weekEndStr = endStr;
      monday = new Date(startStr + 'T00:00:00Z');
    } else {
      const asofDate = new Date(asof + 'T00:00:00Z');
      const dow = asofDate.getUTCDay();
      monday = new Date(asofDate);
      monday.setUTCDate(asofDate.getUTCDate() - ((dow + 6) % 7));
      weekStart = monday.toISOString().slice(0, 10);
      const weekEnd = new Date(monday);
      weekEnd.setUTCDate(monday.getUTCDate() + 6);
      weekEndStr = weekEnd.toISOString().slice(0, 10);
    }

    // Debug mode: return raw counts to diagnose data issues.
    if (searchParams.get('debug') === '1') {
      const c1 = await query('SELECT COUNT(*) AS n FROM public.flip_card_front_stage WHERE hsid::text IN ($1, $2)', [homeHsid, awayHsid]);
      const c2 = await query('SELECT COUNT(*) AS n FROM public.player_game_logs WHERE game_date >= $1::date AND game_date <= $2::date', [weekStart, weekEndStr]);
      const c3 = await query('SELECT COUNT(*) AS n FROM public.player_game_logs gl JOIN public.flip_card_front_stage ph ON ph.playerid::text = gl.playerid::text WHERE ph.hsid::text IN ($1, $2)', [homeHsid, awayHsid]);
      const c4 = await query('SELECT COUNT(*) AS n FROM public.player_game_logs gl JOIN public.flip_card_front_stage ph ON ph.playerid::text = gl.playerid::text WHERE ph.hsid::text IN ($1, $2) AND gl.game_date >= $3::date AND gl.game_date <= $4::date', [homeHsid, awayHsid, weekStart, weekEndStr]);
      const c5 = await query('SELECT gl.game_date::text AS gd, COUNT(*) AS n FROM public.player_game_logs gl JOIN public.flip_card_front_stage ph ON ph.playerid::text = gl.playerid::text WHERE ph.hsid::text IN ($1, $2) GROUP BY gl.game_date ORDER BY gl.game_date DESC LIMIT 5', [homeHsid, awayHsid]);
      return NextResponse.json({
        players_mapped: (c1.rows[0] as any)?.n,
        logs_in_week: (c2.rows[0] as any)?.n,
        logs_for_schools: (c3.rows[0] as any)?.n,
        intersection: (c4.rows[0] as any)?.n,
        recent_dates: c5.rows,
        stats_sample: (await query('SELECT stats::text AS s FROM public.player_game_logs gl JOIN public.flip_card_front_stage ph ON ph.playerid::text = gl.playerid::text WHERE ph.hsid::text IN ($1, $2) AND gl.game_date >= $3::date LIMIT 1', [homeHsid, awayHsid, '2026-09-29'])).rows[0],
      });
    }

    // Query game logs for both schools' players in this week.
    const { rows } = await query<PlayerGameLog>(`
      SELECT gl.playerid, gl.game_date::text AS game_date, gl.stat_type, gl.stats
      FROM public.player_game_logs gl
      JOIN public.flip_card_front_stage ph ON ph.playerid::text = gl.playerid::text
      WHERE ph.hsid::text IN ($1, $2)
        AND gl.game_date >= $3::date
        AND gl.game_date <= $4::date
        
      ORDER BY gl.game_date
    `, [homeHsid, awayHsid, weekStart, weekEndStr]);

    // Aggregate by school and day.
    // Returns d: 8 entries [h_ops+, a_ops+, h_fip-, a_fip-] for Mon-Sun + week.
    const days: Array<{ h: any; a: any }> = Array.from({ length: 7 }, () => ({
      h: { pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, hbp: 0, sf: 0, ip: 0, er: 0, k: 0, bbA: 0, hbpA: 0, hrA: 0 },
      a: { pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, hbp: 0, sf: 0, ip: 0, er: 0, k: 0, bbA: 0, hbpA: 0, hrA: 0 },
    }));

    // Map playerid to school for aggregation.
    const { rows: hsidRows } = await query<{ playerid: string; hsid: string; display_name: string; level: string }>(`
      SELECT DISTINCT
        playerid::text AS playerid,
        hsid::text AS hsid,
        COALESCE(NULLIF(display_name,''), trim(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), playerid::text) AS display_name,
        COALESCE(NULLIF(display_level_label,''), NULLIF(level_label,''), NULLIF(current_level_label,''), NULLIF(current_team_level,''), '') AS level
      FROM public.flip_card_front_stage
      WHERE hsid::text IN ($1, $2)
    `, [homeHsid, awayHsid]);
    const pidToHsid = new Map(hsidRows.map(r => [r.playerid, r.hsid]));
    const metaByPid = new Map(hsidRows.map(r => [r.playerid, r]));

    type PlayerAgg = {
      pa:number; ab:number; h:number; d2:number; d3:number; hr:number; bb:number; hbp:number; sf:number;
      outs:number; phr:number; pbb:number; phbp:number; k:number; hitsAllowed:number; runsAllowed:number; er:number;
    };
    const playerAgg = new Map<string, PlayerAgg>();
    const getPlayerAgg = (pid:string) => {
      let v = playerAgg.get(pid);
      if (!v) {
        v = { pa:0, ab:0, h:0, d2:0, d3:0, hr:0, bb:0, hbp:0, sf:0, outs:0, phr:0, pbb:0, phbp:0, k:0, hitsAllowed:0, runsAllowed:0, er:0 };
        playerAgg.set(pid, v);
      }
      return v;
    };

    for (const row of rows) {
      const hsid = pidToHsid.get(row.playerid);
      if (!hsid) continue;
      const side = hsid === homeHsid ? 'h' : 'a';
      const gd = new Date(row.game_date + 'T00:00:00Z');
      const dayIdx = Math.floor((gd.getTime() - monday.getTime()) / 86400000);
      if (dayIdx < 0 || dayIdx > 6) continue;

      const agg = days[dayIdx][side];
      const st = row.stats || {};
      if (row.stat_type === 'batting' || st.hitting) {
        const h = st.hitting || st;
        const pa = Number(h.plateAppearances ?? (Number(h.atBats || 0) + Number(h.baseOnBalls || 0) + Number(h.hitByPitch || 0) + Number(h.sacFlies || 0)));
        agg.ab += Number(h.atBats || 0);
        agg.h += Number(h.hits || 0);
        agg.d2 += Number(h.doubles || 0);
        agg.d3 += Number(h.triples || 0);
        agg.hr += Number(h.homeRuns || 0);
        agg.bb += Number(h.baseOnBalls || 0);
        agg.hbp += Number(h.hitByPitch || 0);
        agg.sf += Number(h.sacFlies || 0);
        agg.pa += pa;
        const pAgg = getPlayerAgg(row.playerid);
        pAgg.pa += pa; pAgg.ab += Number(h.atBats || 0); pAgg.h += Number(h.hits || 0);
        pAgg.d2 += Number(h.doubles || 0); pAgg.d3 += Number(h.triples || 0); pAgg.hr += Number(h.homeRuns || 0);
        pAgg.bb += Number(h.baseOnBalls || 0); pAgg.hbp += Number(h.hitByPitch || 0); pAgg.sf += Number(h.sacFlies || 0);
      } else if (row.stat_type === 'pitching' || st.pitching) {
        const p = st.pitching || st;
        const ipStr = String(p.inningsPitched || '0');
        const [ipW, ipF] = ipStr.split('.').map(Number);
        const outs = (ipW || 0) * 3 + (ipF || 0);
        agg.ip += outs / 3;
        agg.er += Number(p.earnedRuns || 0);
        agg.k += Number(p.strikeOuts || 0);
        agg.bbA += Number(p.baseOnBalls || 0);
        agg.hbpA += Number(p.hitBatsmen || 0);
        agg.hrA += Number(p.homeRuns || 0);
        const pAgg = getPlayerAgg(row.playerid);
        pAgg.outs += outs; pAgg.phr += Number(p.homeRuns || 0); pAgg.pbb += Number(p.baseOnBalls || 0);
        pAgg.phbp += Number(p.hitBatsmen || 0); pAgg.k += Number(p.strikeOuts || 0);
        pAgg.hitsAllowed += Number(p.hits || 0); pAgg.runsAllowed += Number(p.runs || 0); pAgg.er += Number(p.earnedRuns || 0);
      }
    }

    // Compute daily metrics.
    const d: number[][] = [];
    for (let i = 0; i < 7; i++) {
      const hOps = computeOpsPlus(days[i].h.pa, days[i].h.h, days[i].h.d2, days[i].h.d3, days[i].h.hr, days[i].h.bb, days[i].h.hbp, days[i].h.sf, days[i].h.ab);
      const aOps = computeOpsPlus(days[i].a.pa, days[i].a.h, days[i].a.d2, days[i].a.d3, days[i].a.hr, days[i].a.bb, days[i].a.hbp, days[i].a.sf, days[i].a.ab);
      const hFip = computeFipMinus(days[i].h.ip, days[i].h.hrA, days[i].h.bbA, days[i].h.hbpA, days[i].h.k);
      const aFip = computeFipMinus(days[i].a.ip, days[i].a.hrA, days[i].a.bbA, days[i].a.hbpA, days[i].a.k);
      d.push([hOps ?? 100, aOps ?? 100, hFip ?? 100, aFip ?? 100]);
    }
    // Week aggregates (index 7).
    const wH = { pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, hbp: 0, sf: 0, ip: 0, k: 0, bbA: 0, hbpA: 0, hrA: 0 };
    const wA = { ...wH };
    for (const day of days) {
      for (const k of Object.keys(wH) as (keyof typeof wH)[]) {
        (wH[k] as number) += (day.h[k] as number);
        (wA[k] as number) += (day.a[k] as number);
      }
    }
    d.push([
      computeOpsPlus(wH.pa, wH.h, wH.d2, wH.d3, wH.hr, wH.bb, wH.hbp, wH.sf, wH.ab) ?? 100,
      computeOpsPlus(wA.pa, wA.h, wA.d2, wA.d3, wA.hr, wA.bb, wA.hbp, wA.sf, wA.ab) ?? 100,
      computeFipMinus(wH.ip, wH.hrA, wH.bbA, wH.hbpA, wH.k) ?? 100,
      computeFipMinus(wA.ip, wA.hrA, wA.bbA, wA.hbpA, wA.k) ?? 100,
    ]);

    // Convert the 7 daily comparisons + weekly aggregate into the same
    // run/inning array used by the bracket engine. Inning 9 (club W-L%)
    // remains 0-0 until that live data source is wired.
    const innings:number[] = [];
    for (const [hOps,aOps,hFip,aFip] of d) {
      const hRuns = (hOps > aOps ? 1 : 0) + (hFip < aFip ? 1 : 0);
      const aRuns = (aOps > hOps ? 1 : 0) + (aFip < hFip ? 1 : 0);
      innings.push(hRuns, aRuns);
    }
    innings.push(0, 0);

    const playerRows = (hsid:string) => [...playerAgg.entries()]
      .filter(([pid]) => pidToHsid.get(pid) === hsid)
      .map(([pid,v]) => {
        const meta = metaByPid.get(pid);
        const bat = v.pa > 0 ? [v.pa,v.ab,v.h,v.d2,v.d3,v.hr,v.bb,v.hbp,v.sf] : 0;
        const pit = v.outs > 0 || v.phr || v.pbb || v.phbp || v.k
          ? [v.outs,v.phr,v.pbb,v.phbp,v.k,v.hitsAllowed,v.runsAllowed,v.er, computeFipMinus(v.outs / 3, v.phr, v.pbb, v.phbp, v.k) ?? 100]
          : 0;
        const opsPlus = v.pa > 0 ? computeOpsPlus(v.pa,v.h,v.d2,v.d3,v.hr,v.bb,v.hbp,v.sf,v.ab) : null;
        const fipMinus = pit ? computeFipMinus(v.outs / 3, v.phr, v.pbb, v.phbp, v.k) : null;
        return [pid, meta?.display_name || pid, meta?.level || '', 0, bat, pit, opsPlus, fipMinus, null] as any;
      });

    return NextResponse.json({
      status: 'ok',
      week: weekStart,
      weekEnd: weekEndStr,
      preview,
      d,
      innings,
      h: { p: playerRows(homeHsid), wl: [0, 0] },
      a: { p: playerRows(awayHsid), wl: [0, 0] },
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('live box transformer failed', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'transformer failed', detail: msg }, { status: 500 });
  }
}
