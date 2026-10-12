// src/app/api/contribute/seasons/route.ts
// A player's seasons for the Connect & Contribute drawer, newest first:
//   GET /api/contribute/seasons?playerId=227681
//
//   high school - the four years up to his class year (HS Freshman ... Senior)
//   college     - his college seasons in the TBC stat tables, numbered by year
//                 (College Freshman ... Senior, then 5th Year / Grad Student)
//   pro         - his pro seasons (stat tables and player_team_stints), with
//                 the level (MLB, AAA ...)
// The newest season is "current": the one a current headshot or a flip
// card back photo belongs to.
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { toPlayerSlug } from '@/lib/slug';
import type { Season } from '@/lib/contribute';

export const runtime = 'nodejs';

const HS_YEARS = ['HS Freshman', 'HS Sophomore', 'HS Junior', 'HS Senior'];
const COLLEGE_YEARS = ['College Freshman', 'College Sophomore', 'College Junior', 'College Senior'];
const GRAD_YEAR = '5th Year / Grad Student';
const COLLEGE_LEVEL = /NCAA|NJCAA|NAIA|JUCO|CCCAA|NWAC|USCAA|COLLEGE|^D[123]$/i;

type Row = { year: number; team: string | null; level: string | null; teamid: string | null };

export async function GET(req: NextRequest) {
  const playerId = String(req.nextUrl.searchParams.get('playerId') || '').trim();
  if (!/^\d+$/.test(playerId)) return NextResponse.json({ error: 'Unknown player.' }, { status: 400 });
  try {
    const { rows: stage } = await query<{ first_name: string | null; last_name: string | null; class_of: string | null; hsid: string | null; hsname: string | null }>(
      `SELECT f.first_name, f.last_name, f.class_of::text, f.hsid::text,
              (SELECT hsname FROM school_success s WHERE s.hsid::text = f.hsid::text LIMIT 1) AS hsname
         FROM flip_card_front_stage f WHERE f.playerid::text = $1 LIMIT 1`,
      [playerId]
    );
    const p = stage[0];
    if (!p) return NextResponse.json({ error: 'That player was not found.' }, { status: 404 });

    // Every season in the stat tables (whichever exist) and the pro stints.
    const tables = ['tbc_batting_raw', 'tbc_pitching_raw', 'tbc_batting_2026_season_raw', 'tbc_pitching_2026_season_raw'];
    const { rows: present } = await query<{ t: string }>(
      `SELECT t FROM unnest($1::text[]) AS t WHERE to_regclass('public.' || t) IS NOT NULL`,
      [tables]
    );
    const statSql = present
      .map(({ t }) => `SELECT NULLIF(regexp_replace(r.year::text, '[^0-9]', '', 'g'), '')::int AS year,
                              COALESCE(m.current_team_name, r.teamid::text) AS team, m.level_label AS level, r.teamid::text AS teamid
                         FROM public.${t} r LEFT JOIN teamid_universe_mapping m ON m.teamid::text = r.teamid::text
                        WHERE r.playerid::text = $1`)
      .join(' UNION ');
    const { rows } = await query<Row>(
      `SELECT DISTINCT ON (year, team) year, team, level, teamid FROM (
         ${statSql ? `${statSql} UNION ` : ''}
         SELECT season AS year, team_name AS team, level, teamid FROM player_team_stints WHERE playerid = $1
       ) s WHERE year IS NOT NULL ORDER BY year, team, teamid NULLS LAST`,
      [playerId]
    );

    const seasons: Season[] = [];
    const school = p.hsname || 'High School';
    const classOf = Number(p.class_of);
    if (Number.isInteger(classOf) && classOf > 1900) {
      HS_YEARS.forEach((label, i) => {
        const year = classOf - 3 + i;
        seasons.push({ key: `hs-${year}`, year, stage: 'hs', team: school, level: 'High School', label, current: false });
      });
    }
    const collegeYears = Array.from(new Set(rows.filter((r) => COLLEGE_LEVEL.test(r.level || '')).map((r) => r.year))).sort((a, b) => a - b);
    for (const r of rows) {
      const team = r.team || 'Unknown team';
      const isCollege = COLLEGE_LEVEL.test(r.level || '');
      const label = isCollege ? COLLEGE_YEARS[collegeYears.indexOf(r.year)] || GRAD_YEAR : r.level || 'Pro';
      const key = `${isCollege ? 'college' : 'pro'}-${r.year}-${team}`;
      if (seasons.some((s) => s.key === key)) continue;
      seasons.push({ key, year: r.year, stage: isCollege ? 'college' : 'pro', team, teamId: /^\d+$/.test(r.teamid || '') ? r.teamid! : undefined, level: r.level || '', label, current: false });
    }
    seasons.sort((a, b) => b.year - a.year || (a.stage === b.stage ? 0 : a.stage === 'hs' ? 1 : -1));
    if (seasons[0]) seasons[0].current = true;

    const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
    return NextResponse.json({
      player: {
        playerId,
        name,
        hsid: p.hsid,
        schoolName: p.hsname,
        classOf: Number.isInteger(classOf) ? classOf : null,
        profileUrl: p.hsid ? `/${p.hsid}/player/${playerId}/${toPlayerSlug(p.first_name, p.last_name)}` : null,
      },
      seasons,
    });
  } catch (error) {
    console.error('[contribute/seasons] failed', error);
    return NextResponse.json({ error: 'His seasons could not be loaded.' }, { status: 500 });
  }
}
