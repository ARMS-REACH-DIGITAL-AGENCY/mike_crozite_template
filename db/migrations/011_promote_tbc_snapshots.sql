-- SQL to promote data from snapshot tables to canonical raw tables with validation.
-- Strategy: Only promote CURRENT SEASON (2026) rows for daily updates.
-- Invalid rows are moved to tbc_invalid_rows.

-- 1. Promote Player Identity Snapshots
-- Source: tbc_players_feed_snapshots (Identity feed)
-- Target: tbc_players_raw
WITH validated_players AS (
    SELECT 
        id AS snapshot_id,
        ingest_run_id,
        raw_payload,
        (raw_payload->>'playerid')::TEXT AS playerid,
        (raw_payload->>'firstname')::TEXT AS firstname,
        (raw_payload->>'lastname')::TEXT AS lastname,
        (raw_payload->>'highlevel')::TEXT AS highlevel,
        (raw_payload->>'ht')::TEXT AS ht,
        (raw_payload->>'wt')::TEXT AS wt,
        (raw_payload->>'bats')::TEXT AS bats,
        (raw_payload->>'throws')::TEXT AS throws,
        (raw_payload->>'posit')::TEXT AS posit,
        (raw_payload->>'borndate')::TEXT AS borndate,
        (raw_payload->>'currentage')::NUMERIC AS currentage,
        (raw_payload->>'place')::TEXT AS place,
        (raw_payload->>'high_school')::TEXT AS high_school
    FROM tbc_players_feed_snapshots
    WHERE snapshot_date = CURRENT_DATE
),
invalid_players AS (
    INSERT INTO tbc_invalid_rows (ingest_run_id, snapshot_id, feed_type, raw_payload, error_reason)
    SELECT 
        ingest_run_id, snapshot_id, 'players', raw_payload,
        CASE 
            WHEN playerid IS NULL THEN 'Missing playerid'
            WHEN firstname IS NULL THEN 'Missing firstname'
            WHEN lastname IS NULL THEN 'Missing lastname'
            ELSE 'Unknown validation error'
        END
    FROM validated_players
    WHERE playerid IS NULL OR firstname IS NULL OR lastname IS NULL
    RETURNING snapshot_id
)
INSERT INTO tbc_players_raw (
    playerid, firstname, lastname, highlevel, ht, wt, bats, throws, posit, 
    borndate, currentage, place, high_school
)
SELECT 
    playerid, firstname, lastname, highlevel, ht, wt, bats, throws, posit, 
    borndate, currentage, place, high_school
FROM validated_players
WHERE playerid IS NOT NULL AND firstname IS NOT NULL AND lastname IS NOT NULL
  AND snapshot_id NOT IN (SELECT snapshot_id FROM invalid_players)
ON CONFLICT (playerid) DO UPDATE SET
    firstname = EXCLUDED.firstname,
    lastname = EXCLUDED.lastname,
    highlevel = EXCLUDED.highlevel,
    ht = EXCLUDED.ht,
    wt = EXCLUDED.wt,
    bats = EXCLUDED.bats,
    throws = EXCLUDED.throws,
    posit = EXCLUDED.posit,
    borndate = EXCLUDED.borndate,
    currentage = EXCLUDED.currentage,
    place = EXCLUDED.place,
    high_school = EXCLUDED.high_school;

-- 2. Promote Batting Stats Snapshots
-- Source: tbc_batting_feed_snapshots (Batting stats feed)
-- Target: tbc_batting_raw
WITH validated_batting AS (
    SELECT 
        id AS snapshot_id,
        ingest_run_id,
        raw_payload,
        (raw_payload->>'teamid')::INTEGER AS teamid,
        (raw_payload->>'playerid')::TEXT AS playerid,
        (raw_payload->>'year')::INTEGER AS year,
        (raw_payload->>'uniform')::TEXT AS uniform,
        (raw_payload->>'playername')::TEXT AS playername,
        (raw_payload->>'age')::INTEGER AS age,
        (raw_payload->>'ba')::TEXT AS ba,
        (raw_payload->>'th')::TEXT AS th,
        (raw_payload->>'class')::TEXT AS class,
        (raw_payload->>'posit')::TEXT AS posit,
        (raw_payload->>'g')::INTEGER AS g,
        (raw_payload->>'ab')::INTEGER AS ab,
        (raw_payload->>'r')::INTEGER AS r,
        (raw_payload->>'h')::INTEGER AS h,
        (raw_payload->>'dbl')::INTEGER AS dbl,
        (raw_payload->>'tpl')::INTEGER AS tpl,
        (raw_payload->>'hr')::INTEGER AS hr,
        (raw_payload->>'rbi')::INTEGER AS rbi,
        (raw_payload->>'sb')::INTEGER AS sb,
        (raw_payload->>'cs')::INTEGER AS cs,
        (raw_payload->>'bb')::INTEGER AS bb,
        (raw_payload->>'so')::INTEGER AS so,
        (raw_payload->>'hbp')::INTEGER AS hbp,
        (raw_payload->>'sh')::INTEGER AS sh,
        (raw_payload->>'sf')::INTEGER AS sf,
        (raw_payload->>'ibb')::INTEGER AS ibb,
        (raw_payload->>'gdp')::INTEGER AS gdp,
        (raw_payload->>'tb')::INTEGER AS tb,
        (raw_payload->>'pa')::INTEGER AS pa,
        (raw_payload->>'xbh')::INTEGER AS xbh,
        (raw_payload->>'sgl')::INTEGER AS sgl,
        (raw_payload->>'bavg')::NUMERIC AS bavg,
        (raw_payload->>'obp')::NUMERIC AS obp,
        (raw_payload->>'slg')::NUMERIC AS slg,
        (raw_payload->>'ops')::NUMERIC AS ops,
        (raw_payload->>'seca')::NUMERIC AS seca,
        (raw_payload->>'iso')::NUMERIC AS iso,
        (raw_payload->>'babip')::NUMERIC AS babip,
        (raw_payload->>'bb_pct')::NUMERIC AS bb_pct,
        (raw_payload->>'so_pct')::NUMERIC AS so_pct,
        (raw_payload->>'so_bb')::NUMERIC AS so_bb,
        (raw_payload->>'ab_hr')::NUMERIC AS ab_hr,
        (raw_payload->>'highlevel')::TEXT AS highlevel,
        (raw_payload->>'mlbyears')::TEXT AS mlbyears,
        (raw_payload->>'playyears')::TEXT AS playyears,
        (raw_payload->>'draft_info')::TEXT AS draft_info
    FROM tbc_batting_feed_snapshots
    WHERE snapshot_date = CURRENT_DATE
      AND (raw_payload->>'year')::INTEGER = 2026
),
invalid_batting AS (
    INSERT INTO tbc_invalid_rows (ingest_run_id, snapshot_id, feed_type, raw_payload, error_reason)
    SELECT 
        ingest_run_id, snapshot_id, 'batting', raw_payload,
        CASE 
            WHEN playerid IS NULL THEN 'Missing playerid'
            WHEN bavg < 0 OR bavg > 1 THEN 'Invalid batting average'
            WHEN ops < 0 OR ops > 2 THEN 'Invalid OPS'
            WHEN ab < 0 OR h < 0 OR hr < 0 OR rbi < 0 THEN 'Negative stats'
            WHEN highlevel ~ '^[0-9.]+$' THEN 'Level field contains numeric value'
            ELSE 'Validation failed'
        END
    FROM validated_batting
    WHERE playerid IS NULL 
       OR bavg < 0 OR bavg > 1 
       OR ops < 0 OR ops > 2 
       OR ab < 0 OR h < 0 OR hr < 0 OR rbi < 0
       OR highlevel ~ '^[0-9.]+$'
    RETURNING snapshot_id
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
FROM validated_batting
WHERE snapshot_id NOT IN (SELECT snapshot_id FROM invalid_batting)
ON CONFLICT (playerid, year, teamid) DO UPDATE SET
    uniform = EXCLUDED.uniform,
    playername = EXCLUDED.playername,
    age = EXCLUDED.age,
    ba = EXCLUDED.ba,
    th = EXCLUDED.th,
    class = EXCLUDED.class,
    posit = EXCLUDED.posit,
    g = EXCLUDED.g,
    ab = EXCLUDED.ab,
    r = EXCLUDED.r,
    h = EXCLUDED.h,
    dbl = EXCLUDED.dbl,
    tpl = EXCLUDED.tpl,
    hr = EXCLUDED.hr,
    rbi = EXCLUDED.rbi,
    sb = EXCLUDED.sb,
    cs = EXCLUDED.cs,
    bb = EXCLUDED.bb,
    so = EXCLUDED.so,
    hbp = EXCLUDED.hbp,
    sh = EXCLUDED.sh,
    sf = EXCLUDED.sf,
    ibb = EXCLUDED.ibb,
    gdp = EXCLUDED.gdp,
    tb = EXCLUDED.tb,
    pa = EXCLUDED.pa,
    xbh = EXCLUDED.xbh,
    sgl = EXCLUDED.sgl,
    bavg = EXCLUDED.bavg,
    obp = EXCLUDED.obp,
    slg = EXCLUDED.slg,
    ops = EXCLUDED.ops,
    seca = EXCLUDED.seca,
    iso = EXCLUDED.iso,
    babip = EXCLUDED.babip,
    bb_pct = EXCLUDED.bb_pct,
    so_pct = EXCLUDED.so_pct,
    so_bb = EXCLUDED.so_bb,
    ab_hr = EXCLUDED.ab_hr,
    highlevel = EXCLUDED.highlevel,
    mlbyears = EXCLUDED.mlbyears,
    playyears = EXCLUDED.playyears,
    draft_info = EXCLUDED.draft_info;

-- 3. Promote Pitching Stats Snapshots
-- Source: tbc_pitching_feed_snapshots (Pitching stats feed)
-- Target: tbc_pitching_raw
WITH validated_pitching AS (
    SELECT 
        id AS snapshot_id,
        ingest_run_id,
        raw_payload,
        (raw_payload->>'teamid')::INTEGER AS teamid,
        (raw_payload->>'playerid')::TEXT AS playerid,
        (raw_payload->>'year')::INTEGER AS year,
        (raw_payload->>'uniform')::TEXT AS uniform,
        (raw_payload->>'playername')::TEXT AS playername,
        (raw_payload->>'age')::INTEGER AS age,
        (raw_payload->>'ba')::TEXT AS ba,
        (raw_payload->>'th')::TEXT AS th,
        (raw_payload->>'class')::TEXT AS class,
        (raw_payload->>'w')::INTEGER AS w,
        (raw_payload->>'l')::INTEGER AS l,
        (raw_payload->>'g')::INTEGER AS g,
        (raw_payload->>'gs')::INTEGER AS gs,
        (raw_payload->>'cg')::INTEGER AS cg,
        (raw_payload->>'sho')::INTEGER AS sho,
        (raw_payload->>'gr')::INTEGER AS gr,
        (raw_payload->>'gf')::INTEGER AS gf,
        (raw_payload->>'sv')::INTEGER AS sv,
        (raw_payload->>'ip')::NUMERIC AS ip,
        (raw_payload->>'h')::INTEGER AS h,
        (raw_payload->>'r')::INTEGER AS r,
        (raw_payload->>'er')::INTEGER AS er,
        (raw_payload->>'hr')::INTEGER AS hr,
        (raw_payload->>'bb')::INTEGER AS bb,
        (raw_payload->>'so')::INTEGER AS so,
        (raw_payload->>'wp')::INTEGER AS wp,
        (raw_payload->>'bk')::INTEGER AS bk,
        (raw_payload->>'hb')::INTEGER AS hb,
        (raw_payload->>'era')::NUMERIC AS era,
        (raw_payload->>'whip')::NUMERIC AS whip,
        (raw_payload->>'h9')::NUMERIC AS h9,
        (raw_payload->>'hr9')::NUMERIC AS hr9,
        (raw_payload->>'bb9')::NUMERIC AS bb9,
        (raw_payload->>'so9')::NUMERIC AS so9,
        (raw_payload->>'ra9')::NUMERIC AS ra9,
        (raw_payload->>'so_bb')::NUMERIC AS so_bb,
        (raw_payload->>'highlevel')::TEXT AS highlevel,
        (raw_payload->>'mlbyears')::TEXT AS mlbyears,
        (raw_payload->>'playyears')::TEXT AS playyears,
        (raw_payload->>'draft_info')::TEXT AS draft_info
    FROM tbc_pitching_feed_snapshots
    WHERE snapshot_date = CURRENT_DATE
      AND (raw_payload->>'year')::INTEGER = 2026
),
invalid_pitching AS (
    INSERT INTO tbc_invalid_rows (ingest_run_id, snapshot_id, feed_type, raw_payload, error_reason)
    SELECT 
        ingest_run_id, snapshot_id, 'pitching', raw_payload,
        CASE 
            WHEN playerid IS NULL THEN 'Missing playerid'
            WHEN era < 0 OR era > 20 THEN 'Invalid ERA'
            WHEN ip < 0 OR so < 0 OR bb < 0 THEN 'Negative stats'
            WHEN highlevel ~ '^[0-9.]+$' THEN 'Level field contains numeric value'
            ELSE 'Validation failed'
        END
    FROM validated_pitching
    WHERE playerid IS NULL 
       OR era < 0 OR era > 20 
       OR ip < 0 OR so < 0 OR bb < 0
       OR highlevel ~ '^[0-9.]+$'
    RETURNING snapshot_id
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
FROM validated_pitching
WHERE snapshot_id NOT IN (SELECT snapshot_id FROM invalid_pitching)
ON CONFLICT (playerid, year, teamid) DO UPDATE SET
    uniform = EXCLUDED.uniform,
    playername = EXCLUDED.playername,
    age = EXCLUDED.age,
    ba = EXCLUDED.ba,
    th = EXCLUDED.th,
    class = EXCLUDED.class,
    w = EXCLUDED.w,
    l = EXCLUDED.l,
    g = EXCLUDED.g,
    gs = EXCLUDED.gs,
    cg = EXCLUDED.cg,
    sho = EXCLUDED.sho,
    gr = EXCLUDED.gr,
    gf = EXCLUDED.gf,
    sv = EXCLUDED.sv,
    ip = EXCLUDED.ip,
    h = EXCLUDED.h,
    r = EXCLUDED.r,
    er = EXCLUDED.er,
    hr = EXCLUDED.hr,
    bb = EXCLUDED.bb,
    so = EXCLUDED.so,
    wp = EXCLUDED.wp,
    bk = EXCLUDED.bk,
    hb = EXCLUDED.hb,
    era = EXCLUDED.era,
    whip = EXCLUDED.whip,
    h9 = EXCLUDED.h9,
    hr9 = EXCLUDED.hr9,
    bb9 = EXCLUDED.bb9,
    so9 = EXCLUDED.so9,
    ra9 = EXCLUDED.ra9,
    so_bb = EXCLUDED.so_bb,
    highlevel = EXCLUDED.highlevel,
    mlbyears = EXCLUDED.mlbyears,
    playyears = EXCLUDED.playyears,
    draft_info = EXCLUDED.draft_info;
