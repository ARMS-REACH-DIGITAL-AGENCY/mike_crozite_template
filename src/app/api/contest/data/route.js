// app/api/contest/data/route.js
import { NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // robust numeric extraction helper using regex test
  // Build SQL: compute daily per-inning team OPS+ and FIP-minus for hsid 5004 (Hamilton) and 9655 (Basha)
  const sql = `
WITH week AS (
  SELECT week_start, week_end
  FROM season_calendar_week
  WHERE season_year = 2026 AND week_index = 1
),
days AS (
  SELECT gs::date AS game_date,
         (ROW_NUMBER() OVER (ORDER BY gs))::int AS inning
  FROM week w
  CROSS JOIN generate_series(w.week_start, w.week_end, interval '1 day') AS gs
),
-- safe numeric cast using regex: if the trimmed value matches a numeric pattern, cast it, else 0
team_batting_totals AS (
  SELECT
    hsid::integer,
    SUM(CASE WHEN trim(ab) ~ '^[0-9]+(\\.[0-9]+)?$' THEN trim(ab)::numeric ELSE 0 END) AS ab,
    SUM(CASE WHEN trim(h) ~ '^[0-9]+(\\.[0-9]+)?$' THEN trim(h)::numeric ELSE 0 END) AS h,
    SUM(CASE WHEN trim(dbl) ~ '^[0-9]+(\\.[0-9]+)?$' THEN trim(dbl)::numeric ELSE 0 END) AS dbl,
    SUM(CASE WHEN trim(tpl) ~ '^[0-9]+(\\.[0-9]+)?$' THEN trim(tpl)::numeric ELSE 0 END) AS tpl,
    SUM(CASE WHEN trim(hr) ~ '^[0-9]+(\\.[0-9]+)?$' THEN trim(hr)::numeric ELSE 0 END) AS hr,
    SUM(CASE WHEN trim(bb) ~ '^[0-9]+(\\.[0-9]+)?$' THEN trim(bb)::numeric ELSE 0 END) AS bb,
    SUM(CASE WHEN trim(hbp) ~ '^[0-9]+(\\.[0-9]+)?$' THEN trim(hbp)::numeric ELSE 0 END) AS hbp,
    SUM(CASE WHEN trim(sf) ~ '^[0-9]+(\\.[0-9]+)?$' THEN trim(sf)::numeric ELSE 0 END) AS sf
  FROM sim_daily_batting
  WHERE hsid::integer IN (5004, 9655)
  GROUP BY hsid::integer
),
bat_params AS ( SELECT 0.720::numeric AS baseline_ops ),
team_ops_plus_day AS (
  SELECT
    d.game_date,
    d.inning,
    t.hsid,
    ROUND(
      100 * (
        (
          (
            (t.h + t.bb + t.hbp) / NULLIF(t.ab + t.bb + t.hbp + t.sf, 0)
          ) +
          (
            (GREATEST(t.h - t.dbl - t.tpl - t.hr, 0) + 2*t.dbl + 3*t.tpl + 4*t.hr) / NULLIF(t.ab, 0)
          )
        ) / NULLIF(p.baseline_ops, 0)
      ),
      1
    ) AS team_ops_plus
  FROM days d
  CROSS JOIN team_batting_totals t
  CROSS JOIN bat_params p
),
pit_params AS ( SELECT 4.130::numeric AS baseline_fip ),
team_pitching_totals AS (
  -- NOTE: sim_daily_pitching uses 'hb' for hit batters. Map it to hbp in totals for FIP.
  SELECT
    hsid::integer,
    SUM(CASE WHEN trim(ip) ~ '^[0-9]+(\\.[0-9]+)?$' THEN trim(ip)::numeric ELSE 0 END) AS ip,
    SUM(CASE WHEN trim(hr) ~ '^[0-9]+(\\.[0-9]+)?$' THEN trim(hr)::numeric ELSE 0 END) AS hr,
    SUM(CASE WHEN trim(bb) ~ '^[0-9]+(\\.[0-9]+)?$' THEN trim(bb)::numeric ELSE 0 END) AS bb,
    SUM(CASE WHEN trim(hb) ~ '^[0-9]+(\\.[0-9]+)?$' THEN trim(hb)::numeric ELSE 0 END) AS hbp,
    SUM(CASE WHEN trim(so) ~ '^[0-9]+(\\.[0-9]+)?$' THEN trim(so)::numeric ELSE 0 END) AS so
  FROM sim_daily_pitching
  WHERE hsid::integer IN (5004, 9655)
  GROUP BY hsid::integer
),
team_fip_minus_day AS (
  SELECT
    d.game_date,
    d.inning,
    p.hsid,
    ROUND(
      100 * (
        (((13*p.hr + 3*(p.bb + p.hbp) - 2*p.so) / NULLIF(p.ip,0)) / NULLIF(bp.baseline_fip,0))
      ),
      1
    ) AS team_fip_minus
  FROM days d
  CROSS JOIN team_pitching_totals p
  CROSS JOIN pit_params bp
),
joined AS (
  SELECT
    d.game_date,
    d.inning,
    oh.team_ops_plus  AS ham_ops_plus,
    oa.team_ops_plus  AS bas_ops_plus,
    ph.team_fip_minus AS ham_fip_minus,
    pa.team_fip_minus AS bas_fip_minus
  FROM days d
  JOIN team_ops_plus_day oh ON oh.game_date=d.game_date AND oh.hsid=5004
  JOIN team_ops_plus_day oa ON oa.game_date=d.game_date AND oa.hsid=9655
  JOIN team_fip_minus_day ph ON ph.game_date=d.game_date AND ph.hsid=5004
  JOIN team_fip_minus_day pa ON pa.game_date=d.game_date AND pa.hsid=9655
)
SELECT
  game_date,
  inning,
  ham_ops_plus, bas_ops_plus,
  ham_fip_minus, bas_fip_minus,
  CASE WHEN ham_ops_plus > bas_ops_plus THEN 1 WHEN ham_ops_plus < bas_ops_plus THEN 0 ELSE 0 END AS ham_run_ops,
  CASE WHEN ham_ops_plus > bas_ops_plus THEN 0 WHEN ham_ops_plus < bas_ops_plus THEN 1 ELSE 0 END AS bas_run_ops,
  CASE WHEN ham_fip_minus < bas_fip_minus THEN 1 WHEN ham_fip_minus > bas_fip_minus THEN 0 ELSE 0 END AS ham_run_fip,
  CASE WHEN ham_fip_minus < bas_fip_minus THEN 0 WHEN ham_fip_minus > bas_fip_minus THEN 1 ELSE 0 END AS bas_run_fip
FROM joined
ORDER BY inning;
`;

  try {
    const result = await client.query(sql);
    await client.end();
    return NextResponse.json({ rows: result.rows });
  } catch (err) {
    await client.end();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
