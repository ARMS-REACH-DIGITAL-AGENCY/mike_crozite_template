-- SQL to promote data from snapshot tables to canonical raw tables with refined validation.
-- Strategy:
--   1) validate today's snapshot rows
--   2) write invalid rows to tbc_invalid_rows
--   3) delete matching target keys for valid rows
--   4) insert valid rows
--
-- This avoids ON CONFLICT requirements on target tables that do not have matching unique constraints.

BEGIN;

-- 1. Promote Player Identity Snapshots
-- Source: tbc_players_feed_snapshots
-- Target: tbc_players_raw

WITH validated_players AS (
    SELECT
        snapshot_id,
        ingest_run_id,
        raw_payload,
        (raw_payload::jsonb->>'playerid')::TEXT AS playerid,
        (raw_payload::jsonb->>'firstname')::TEXT AS firstname,
        (raw_payload::jsonb->>'lastname')::TEXT AS lastname,
        (raw_payload::jsonb->>'highlevel')::TEXT AS highlevel,
        (raw_payload::jsonb->>'ht')::TEXT AS ht,
        (raw_payload::jsonb->>'wt')::TEXT AS wt,
        (raw_payload::jsonb->>'bats')::TEXT AS bats,
        (raw_payload::jsonb->>'throws')::TEXT AS throws,
        (raw_payload::jsonb->>'posit')::TEXT AS posit,
        (raw_payload::jsonb->>'borndate')::TEXT AS borndate,
        (raw_payload::jsonb->>'currentage')::NUMERIC AS currentage,
        (raw_payload::jsonb->>'place')::TEXT AS place,
        (raw_payload::jsonb->>'high_school')::TEXT AS high_school
    FROM tbc_players_feed_snapshots
    WHERE snapshot_date = CURRENT_DATE
),
invalid_players AS (
    INSERT INTO tbc_invalid_rows (ingest_run_id, snapshot_id, feed_type, raw_payload, error_reason)
    SELECT
        ingest_run_id,
        snapshot_id,
        'players',
        raw_payload,
        CASE
            WHEN playerid IS NULL THEN 'Missing playerid'
            WHEN firstname IS NULL THEN 'Missing firstname'
            WHEN lastname IS NULL THEN 'Missing lastname'
            ELSE 'Unknown validation error'
        END
    FROM validated_players
    WHERE playerid IS NULL OR firstname IS NULL OR lastname IS NULL
    RETURNING snapshot_id
),
valid_players AS (
    SELECT
        playerid, firstname, lastname, highlevel, ht, wt, bats, throws, posit,
        borndate, currentage, place, high_school
    FROM validated_players
    WHERE playerid IS NOT NULL
      AND firstname IS NOT NULL
      AND lastname IS NOT NULL
      AND snapshot_id NOT IN (SELECT snapshot_id FROM invalid_players)
),
deleted_players AS (
    DELETE FROM tbc_players_raw t
    USING valid_players v
    WHERE t.playerid = v.playerid
    RETURNING t.playerid
)
INSERT INTO tbc_players_raw (
    playerid, firstname, lastname, highlevel, ht, wt, bats, throws, posit,
    borndate, currentage, place, high_school
)
SELECT
    playerid, firstname, lastname, highlevel, ht, wt, bats, throws, posit,
    borndate, currentage, place, high_school
FROM valid_players;


-- 2. Promote Batting Stats Snapshots
-- Source: tbc_batting_feed_snapshots
-- Target: tbc_batting_raw

WITH validated_batting AS (
    SELECT
        snapshot_id,
        ingest_run_id,
        raw_payload,
        (raw_payload::jsonb->>'teamid')::INTEGER AS teamid,
        (raw_payload::jsonb->>'playerid')::TEXT AS playerid,
        (raw_payload::jsonb->>'year')::INTEGER AS year,
        (raw_payload::jsonb->>'uniform')::TEXT AS uniform,
        (raw_payload::jsonb->>'playername')::TEXT AS playername,
        (raw_payload::jsonb->>'age')::INTEGER AS age,
        (raw_payload::jsonb->>'ba')::TEXT AS ba,
        (raw_payload::jsonb->>'th')::TEXT AS th,
        (raw_payload::jsonb->>'class')::TEXT AS class,
        (raw_payload::jsonb->>'posit')::TEXT AS posit,
        (raw_payload::jsonb->>'g')::INTEGER AS g,
        (raw_payload::jsonb->>'ab')::INTEGER AS ab,
        (raw_payload::jsonb->>'r')::INTEGER AS r,
        (raw_payload::jsonb->>'h')::INTEGER AS h,
        (raw_payload::jsonb->>'dbl')::INTEGER AS dbl,
        (raw_payload::jsonb->>'tpl')::INTEGER AS tpl,
        (raw_payload::jsonb->>'hr')::INTEGER AS hr,
        (raw_payload::jsonb->>'rbi')::INTEGER AS rbi,
        (raw_payload::jsonb->>'sb')::INTEGER AS sb,
        (raw_payload::jsonb->>'cs')::INTEGER AS cs,
        (raw_payload::jsonb->>'bb')::INTEGER AS bb,
        (raw_payload::jsonb->>'so')::INTEGER AS so,
        (raw_payload::jsonb->>'hbp')::INTEGER AS hbp,
        (raw_payload::jsonb->>'sh')::INTEGER AS sh,
        (raw_payload::jsonb->>'sf')::INTEGER AS sf,
        (raw_payload::jsonb->>'ibb')::INTEGER AS ibb,
        (raw_payload::jsonb->>'gdp')::INTEGER AS gdp,
        (raw_payload::jsonb->>'tb')::INTEGER AS tb,
        (raw_payload::jsonb->>'pa')::INTEGER AS pa,
        (raw_payload::jsonb->>'xbh')::INTEGER AS xbh,
        (raw_payload::jsonb->>'sgl')::INTEGER AS sgl,
        (raw_payload::jsonb->>'bavg')::NUMERIC AS bavg,
        (raw_payload::jsonb->>'obp')::NUMERIC AS obp,
        (raw_payload::jsonb->>'slg')::NUMERIC AS slg,
        (raw_payload::jsonb->>'ops')::NUMERIC AS ops,
        (raw_payload::jsonb->>'seca')::NUMERIC AS seca,
        (raw_payload::jsonb->>'iso')::NUMERIC AS iso,
        (raw_payload::jsonb->>'babip')::NUMERIC AS babip,
        (raw_payload::jsonb->>'bb_pct')::NUMERIC AS bb_pct,
        (raw_payload::jsonb->>'so_pct')::NUMERIC AS so_pct,
        (raw_payload::jsonb->>'so_bb')::NUMERIC AS so_bb,
        (raw_payload::jsonb->>'ab_hr')::NUMERIC AS ab_hr,
        (raw_payload::jsonb->>'highlevel')::TEXT AS highlevel,
        (raw_payload::jsonb->>'mlbyears')::TEXT AS mlbyears,
        (raw_payload::jsonb->>'playyears')::TEXT AS playyears,
        (raw_payload::jsonb->>'draft_info')::TEXT AS draft_info
    FROM tbc_batting_feed_snapshots
    WHERE snapshot_date = CURRENT_DATE
      AND (raw_payload::jsonb->>'year')::INTEGER = 2026
),
invalid_batting AS (
    INSERT INTO tbc_invalid_rows (ingest_run_id, snapshot_id, feed_type, raw_payload, error_reason)
    SELECT
        ingest_run_id,
        snapshot_id,
        'batting',
        raw_payload,
        CASE
            WHEN playerid IS NULL THEN 'Missing playerid'
            WHEN bavg < 0 OR bavg > 1 THEN 'Invalid batting average (must be 0-1)'
            WHEN ops < 0 OR ops > 2 THEN 'Invalid OPS (must be 0-2)'
            WHEN ab < 0 OR h < 0 OR hr < 0 OR rbi < 0 THEN 'Negative stats'
            WHEN highlevel ~ '^[0-9.]+$' THEN 'Level field contains numeric value (parsing shift)'
            ELSE 'Validation failed'
        END
    FROM validated_batting
    WHERE playerid IS NULL
       OR bavg < 0 OR bavg > 1
       OR ops < 0 OR ops > 2
       OR ab < 0 OR h < 0 OR hr < 0 OR rbi < 0
       OR highlevel ~ '^[0-9.]+$'
    RETURNING snapshot_id
),
valid_batting AS (
    SELECT
        teamid, playerid, year, uniform, playername, age, ba, th, class, posit,
        g, ab, r, h, dbl, tpl, hr, rbi, sb, cs, bb, so, hbp, sh, sf, ibb, gdp,
        tb, pa, xbh, sgl, bavg, obp, slg, ops, seca, iso, babip, bb_pct, so_pct,
        so_bb, ab_hr, highlevel, mlbyears, playyears, draft_info
    FROM validated_batting
    WHERE snapshot_id NOT IN (SELECT snapshot_id FROM invalid_batting)
),
deleted_batting AS (
    DELETE FROM tbc_batting_raw t
    USING valid_batting v
    WHERE t.playerid::text = v.playerid
      AND NULLIF(t.year::text, '')::integer = v.year
      AND NULLIF(t.teamid::text, '')::integer = v.teamid
    RETURNING t.playerid
)
INSERT INTO tbc_batting_raw (
    teamid, playerid, year, uniform, playername, age, ba, th, class, posit,
    g, ab, r, h, dbl, tpl, hr, rbi, sb, cs, bb, so, hbp, sh, sf, ibb, gdp,
    tb, pa, xbh, sgl, bavg, obp, slg, ops, seca, iso, babip, bb_pct, so_pct,
    so_bb, ab_hr, highlevel, mlbyears, playyears, draft_info
)
SELECT
    teamid, playerid, year, uniform, playername, age, ba, th, class, posit,
    g, ab, r, h, dbl, tpl, hr, rbi, sb, cs, bb, so, hbp, sh, sf, ibb, gdp,
    tb, pa, xbh, sgl, bavg, obp, slg, ops, seca, iso, babip, bb_pct, so_pct,
    so_bb, ab_hr, highlevel, mlbyears, playyears, draft_info
FROM valid_batting;


-- 3. Promote Pitching Stats Snapshots
-- Source: tbc_pitching_feed_snapshots
-- Target: tbc_pitching_raw

WITH validated_pitching AS (
    SELECT
        snapshot_id,
        ingest_run_id,
        raw_payload,
        (raw_payload::jsonb->>'teamid')::INTEGER AS teamid,
        (raw_payload::jsonb->>'playerid')::TEXT AS playerid,
        (raw_payload::jsonb->>'year')::INTEGER AS year,
        (raw_payload::jsonb->>'uniform')::TEXT AS uniform,
        (raw_payload::jsonb->>'playername')::TEXT AS playername,
        (raw_payload::jsonb->>'age')::INTEGER AS age,
        (raw_payload::jsonb->>'ba')::TEXT AS ba,
        (raw_payload::jsonb->>'th')::TEXT AS th,
        (raw_payload::jsonb->>'class')::TEXT AS class,
        (raw_payload::jsonb->>'w')::INTEGER AS w,
        (raw_payload::jsonb->>'l')::INTEGER AS l,
        (raw_payload::jsonb->>'g')::INTEGER AS g,
        (raw_payload::jsonb->>'gs')::INTEGER AS gs,
        (raw_payload::jsonb->>'cg')::INTEGER AS cg,
        (raw_payload::jsonb->>'sho')::INTEGER AS sho,
        (raw_payload::jsonb->>'gr')::INTEGER AS gr,
        (raw_payload::jsonb->>'gf')::INTEGER AS gf,
        (raw_payload::jsonb->>'sv')::INTEGER AS sv,
        (raw_payload::jsonb->>'ip')::NUMERIC AS ip,
        (raw_payload::jsonb->>'h')::INTEGER AS h,
        (raw_payload::jsonb->>'r')::INTEGER AS r,
        (raw_payload::jsonb->>'er')::INTEGER AS er,
        (raw_payload::jsonb->>'hr')::INTEGER AS hr,
        (raw_payload::jsonb->>'bb')::INTEGER AS bb,
        (raw_payload::jsonb->>'so')::INTEGER AS so,
        (raw_payload::jsonb->>'wp')::INTEGER AS wp,
        (raw_payload::jsonb->>'bk')::INTEGER AS bk,
        (raw_payload::jsonb->>'hb')::INTEGER AS hb,
        (raw_payload::jsonb->>'era')::NUMERIC AS era,
        (raw_payload::jsonb->>'whip')::NUMERIC AS whip,
        (raw_payload::jsonb->>'h9')::NUMERIC AS h9,
        (raw_payload::jsonb->>'hr9')::NUMERIC AS hr9,
        (raw_payload::jsonb->>'bb9')::NUMERIC AS bb9,
        (raw_payload::jsonb->>'so9')::NUMERIC AS so9,
        (raw_payload::jsonb->>'ra9')::NUMERIC AS ra9,
        (raw_payload::jsonb->>'so_bb')::NUMERIC AS so_bb,
        (raw_payload::jsonb->>'highlevel')::TEXT AS highlevel,
        (raw_payload::jsonb->>'mlbyears')::TEXT AS mlbyears,
        (raw_payload::jsonb->>'playyears')::TEXT AS playyears,
        (raw_payload::jsonb->>'draft_info')::TEXT AS draft_info
    FROM tbc_pitching_feed_snapshots
    WHERE snapshot_date = CURRENT_DATE
      AND (raw_payload::jsonb->>'year')::INTEGER = 2026
),
invalid_pitching AS (
    INSERT INTO tbc_invalid_rows (ingest_run_id, snapshot_id, feed_type, raw_payload, error_reason)
    SELECT
        ingest_run_id,
        snapshot_id,
        'pitching',
        raw_payload,
        CASE
            WHEN playerid IS NULL THEN 'Missing playerid'
            WHEN era < 0 OR era > 99.99 THEN 'Invalid ERA (must be 0-99.99)'
            WHEN ip < 0 OR so < 0 OR bb < 0 THEN 'Negative stats'
            WHEN highlevel ~ '^[0-9.]+$' THEN 'Level field contains numeric value (parsing shift)'
            ELSE 'Validation failed'
        END
    FROM validated_pitching
    WHERE playerid IS NULL
       OR era < 0 OR era > 99.99
       OR ip < 0 OR so < 0 OR bb < 0
       OR highlevel ~ '^[0-9.]+$'
    RETURNING snapshot_id
),
valid_pitching AS (
    SELECT
        teamid, playerid, year, uniform, playername, age, ba, th, class,
        w, l, g, gs, cg, sho, gr, gf, sv, ip, h, r, er, hr, bb, so, wp, bk, hb,
        era, whip, h9, hr9, bb9, so9, ra9, so_bb, highlevel, mlbyears, playyears, draft_info
    FROM validated_pitching
    WHERE snapshot_id NOT IN (SELECT snapshot_id FROM invalid_pitching)
),
deleted_pitching AS (
    DELETE FROM tbc_pitching_raw t
    USING valid_pitching v
    WHERE t.playerid::text = v.playerid
      AND NULLIF(t.year::text, '')::integer = v.year
      AND NULLIF(t.teamid::text, '')::integer = v.teamid
    RETURNING t.playerid
)
    INSERT INTO tbc_pitching_raw (
    teamid, playerid, year, uniform, playername, age, ba, th, class,
    w, l, g, gs, cg, sho, gr, gf, sv, ip, h, r, er, hr, bb, so, wp, bk, hb,
    era, whip, h9, hr9, bb9, so9, ra9, so_bb, highlevel, mlbyears, playyears, draft_info
)
SELECT
    teamid, playerid, year, uniform, playername, age, ba, th, class,
    w, l, g, gs, cg, sho, gr, gf, sv, ip, h, r, er, hr, bb, so, wp, bk, hb,
    era, whip, h9, hr9, bb9, so9, ra9, so_bb, highlevel, mlbyears, playyears, draft_info
FROM valid_pitching;

COMMIT;
