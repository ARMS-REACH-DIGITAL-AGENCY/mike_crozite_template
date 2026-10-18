// src/lib/officialLevels.ts
// The official player levels (Pete, Oct 18, 2026) and the aliases that may be
// rewritten to them without a person looking. Used by the weekly level check
// (src/app/api/cron/level-qc) and the one-time cleanup it was born from.
//
// Not in the alias list on purpose: JUCO (each player is NJCAA, CCCAA or NWAC
// by his college - a person decides) and generic NCAA (TBC's career level,
// which doesn't say the division). The check reports those instead.

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
  RK: 'ROOKIE',
  INTL: 'INTERNATIONAL', "INT'L": 'INTERNATIONAL',
  INDEPENDENT: 'INDY',
  D1: 'NCAA-D1', 'NCAA D1': 'NCAA-D1',
  D2: 'NCAA-D2', 'NCAA D2': 'NCAA-D2',
  D3: 'NCAA-D3', 'NCAA D3': 'NCAA-D3',
  JRCOLLEGE: 'NJCAA',
  HS: 'HIGH SCHOOL',
};

// One SQL statement that rewrites a level column of flip_card_front_stage:
// known aliases and wrong capitalisation become the official level, and
// placeholder dashes or blanks become NULL. Returns the rows it changed.
export function levelFixSql(column: 'level_label' | 'display_level_label') {
  const pairs = [
    ...Object.entries(LEVEL_FIXES),
    ...OFFICIAL_LEVELS.map((level) => [level, level] as const),
  ];
  const values = pairs.map(([from, to]) => `('${from.replace(/'/g, "''")}', '${to}')`).join(',\n      ');
  return `
    WITH fixes(from_level, to_level) AS (VALUES
      ${values}
    ), changed AS (
      UPDATE public.flip_card_front_stage f
         SET ${column} = x.new_level, updated_at = now()
        FROM (SELECT f2.ctid AS rid,
                     CASE WHEN TRIM(f2.${column}) IN ('', '-', '--') THEN NULL ELSE fx.to_level END AS new_level
                FROM public.flip_card_front_stage f2
                LEFT JOIN fixes fx ON fx.from_level = UPPER(TRIM(f2.${column}))
               WHERE f2.${column} IS NOT NULL
                 AND (TRIM(f2.${column}) IN ('', '-', '--')
                      OR (fx.to_level IS NOT NULL AND f2.${column} IS DISTINCT FROM fx.to_level))) x
       WHERE f.ctid = x.rid
      RETURNING 1
    )
    SELECT count(*)::int AS fixed FROM changed`;
}

// What's left that isn't official, for the report (active players first).
export const LEVEL_LEFTOVERS_SQL = `
  SELECT column_name, value, count(*)::int AS players,
         count(*) FILTER (WHERE active)::int AS active
    FROM (
      SELECT 'level_label' AS column_name, level_label AS value,
             (status_label ILIKE 'active%' OR status_label ILIKE 'current%') AS active
        FROM public.flip_card_front_stage WHERE level_label IS NOT NULL
      UNION ALL
      SELECT 'display_level_label', display_level_label,
             (status_label ILIKE 'active%' OR status_label ILIKE 'current%')
        FROM public.flip_card_front_stage WHERE display_level_label IS NOT NULL
    ) v
   WHERE NOT (value = ANY($1::text[]))
   GROUP BY 1, 2
   ORDER BY active DESC, players DESC`;
