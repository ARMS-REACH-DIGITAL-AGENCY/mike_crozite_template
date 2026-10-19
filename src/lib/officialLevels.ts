// src/lib/officialLevels.ts
// The official player levels (Pete, Oct 18, 2026) and the aliases that may be
// rewritten to them without a person looking. Used by the weekly level check
// (src/app/api/cron/level-qc) and the one-time cleanups it was born from.
//
// Not in the alias list on purpose: JUCO (each player is NJCAA, CCCAA or NWAC
// by his college - a person decides), generic NCAA (TBC's career level, which
// doesn't say the division) and PRO (TBC's word for any pro team: MLB, an
// affiliate, Indy ball or a foreign league). The check reports those instead.

export const OFFICIAL_LEVELS = [
  'MLB', 'TRIPLE-A', 'DOUBLE-A', 'HIGH-A', 'SINGLE-A', 'ROOKIE', 'INDY', 'INTERNATIONAL',
  'NCAA-D1', 'NCAA-D2', 'NCAA-D3', 'NAIA', 'NJCAA', 'CCCAA', 'NWAC', 'HIGH SCHOOL',
] as const;

// Upper-cased, trimmed alias -> official level.
export const LEVEL_FIXES: Record<string, string> = {
  AAA: 'TRIPLE-A', 'TRIPLE-A (40-MAN)': 'TRIPLE-A',
  AA: 'DOUBLE-A',
  'A+': 'HIGH-A', 'HIGH A': 'HIGH-A',
  A: 'SINGLE-A', 'A-': 'SINGLE-A', 'LOW-A': 'SINGLE-A', 'LOW A': 'SINGLE-A', 'SINGLE A': 'SINGLE-A',
  RK: 'ROOKIE', 'ROOKIE (40-MAN)': 'ROOKIE',
  INTL: 'INTERNATIONAL', "INT'L": 'INTERNATIONAL',
  INDEPENDENT: 'INDY',
  D1: 'NCAA-D1', 'NCAA D1': 'NCAA-D1',
  D2: 'NCAA-D2', 'NCAA D2': 'NCAA-D2',
  D3: 'NCAA-D3', 'NCAA D3': 'NCAA-D3',
  JRCOLLEGE: 'NJCAA',
  HS: 'HIGH SCHOOL',
};

// The level columns the weekly check rewrites. Everything the site reads.
// A source's own raw files (fan submissions, college schedule landings, the
// 150-team reference exports) are only reported, never rewritten.
export const LEVEL_FIX_TARGETS: { table: string; column: string; stamp?: string }[] = [
  { table: 'flip_card_front_stage', column: 'level_label', stamp: 'updated_at' },
  { table: 'flip_card_front_stage', column: 'display_level_label', stamp: 'updated_at' },
  { table: 'flip_card_front_stage', column: 'current_level_label', stamp: 'updated_at' },
  { table: 'flip_card_front_stage', column: 'previous_level_label', stamp: 'updated_at' },
  { table: 'flip_card_front_stage', column: 'committed_level_label', stamp: 'updated_at' },
  { table: 'flip_card_front_stage', column: 'current_team_level', stamp: 'updated_at' },
  { table: 'teamid_universe_mapping', column: 'level_label' },
  { table: 'player_team_stints', column: 'level' },
  { table: 'team_schedules', column: 'level' },
  { table: 'teams', column: 'level' },
  { table: 'player_current_team', column: 'level' },
  { table: 'mlb_org_roster_raw', column: 'level' },
  { table: 'tbc_to_mlb_team_map', column: 'level' },
  { table: 'news_articles', column: 'level_label' },
  { table: 'hamilton_all_time_import_stage', column: 'level_label' },
  { table: 'hamilton_all_time_import_stage', column: 'display_level_label' },
  { table: 'hamilton_all_time_import_stage', column: 'current_team_level' },
];

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

// One SQL statement that rewrites one level column: known aliases and wrong
// capitalisation become the official level, and placeholder dashes or blanks
// become NULL. Returns the rows it changed.
export function levelFixSql({ table, column, stamp }: { table: string; column: string; stamp?: string }) {
  const pairs = [
    ...Object.entries(LEVEL_FIXES),
    ...OFFICIAL_LEVELS.map((level) => [level, level] as const),
  ];
  const values = pairs.map(([from, to]) => `('${from.replace(/'/g, "''")}', '${to}')`).join(',\n      ');
  const t = `public.${ident(table)}`;
  const c = ident(column);
  return `
    WITH fixes(from_level, to_level) AS (VALUES
      ${values}
    ), changed AS (
      UPDATE ${t} f
         SET ${c} = x.new_level${stamp ? `, ${ident(stamp)} = now()` : ''}
        FROM (SELECT f2.ctid AS rid,
                     CASE WHEN TRIM(f2.${c}) IN ('', '-', '--') THEN NULL ELSE fx.to_level END AS new_level
                FROM ${t} f2
                LEFT JOIN fixes fx ON fx.from_level = UPPER(TRIM(f2.${c}))
               WHERE f2.${c} IS NOT NULL
                 AND (TRIM(f2.${c}) IN ('', '-', '--')
                      OR (fx.to_level IS NOT NULL AND f2.${c} IS DISTINCT FROM fx.to_level))) x
       WHERE f.ctid = x.rid
      RETURNING 1
    )
    SELECT count(*)::int AS fixed FROM changed`;
}

// Every text column named like "level" in every table (backups and snapshots
// aside), and each value in it that isn't official. New tables and columns are
// picked up on their own, so nothing slips in unseen. $1 = OFFICIAL_LEVELS.
export const LEVEL_SCAN_SQL = `
  WITH cols AS (
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t USING (table_schema, table_name)
     WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
       AND c.data_type IN ('text', 'character varying')
       AND c.column_name ILIKE '%level%' AND c.column_name NOT ILIKE '%highlevel%'
       AND c.table_name !~ '(backup|baseline|snapshot|quarantine|landing|suspect|_raw_2$|_[0-9]{8})'
  )
  SELECT c.table_name, c.column_name,
         (xpath('/row/v/text()', r))[1]::text AS value,
         (xpath('/row/n/text()', r))[1]::text::int AS rows
    FROM cols c,
         LATERAL unnest(xpath('/table/row', query_to_xml(format(
           'SELECT %1$I AS v, count(*) AS n FROM public.%2$I
             WHERE %1$I IS NOT NULL AND TRIM(%1$I) <> '''' AND NOT (%1$I = ANY(%3$L::text[]))
             GROUP BY 1', c.column_name, c.table_name, $1::text), true, false, ''))) r
   ORDER BY rows DESC`;

// The same for the cards people see: active players whose card level isn't
// official (JUCO, generic NCAA ...). $1 = OFFICIAL_LEVELS.
export const ACTIVE_CARD_LEFTOVERS_SQL = `
  SELECT playerid, display_name, current_team_name, display_level_label AS card_level
    FROM public.flip_card_front_stage
   WHERE (status_label ILIKE 'active%' OR status_label ILIKE 'current%')
     AND display_level_label IS NOT NULL
     AND NOT (display_level_label = ANY($1::text[]))
   ORDER BY display_level_label, display_name`;

// Active cards that say one level while the team cross-check
// (teamid_universe_mapping) gives their current team another. $1 = OFFICIAL_LEVELS.
export const TEAM_LEVEL_MISMATCH_SQL = `
  SELECT f.playerid, f.display_name, f.current_team_name,
         f.display_level_label AS card_level, m.level_label AS team_level
    FROM public.flip_card_front_stage f
    JOIN public.teamid_universe_mapping m ON m.teamid = f.current_teamid::text
   WHERE (f.status_label ILIKE 'active%' OR f.status_label ILIKE 'current%')
     AND m.level_label = ANY($1::text[])
     AND f.display_level_label IS DISTINCT FROM m.level_label
   ORDER BY f.display_name`;
