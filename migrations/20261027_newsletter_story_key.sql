-- daily_game_stories: one story per school per game per day. The first key
-- (stats_date, hsid) allowed one story per school per day, which is right for
-- 2027 (one game a week each) but not for the test season, where a school can
-- be in two test brackets at once (Hamilton is in brackets 1 and 6). Changed
-- while the table was still empty. Safe to run again.

DO $$
BEGIN
  IF (SELECT array_agg(a.attname::text ORDER BY k.ord)
        FROM pg_constraint c
        CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
       WHERE c.conrelid = 'public.daily_game_stories'::regclass AND c.contype = 'p') = ARRAY['stats_date', 'hsid'] THEN
    ALTER TABLE public.daily_game_stories DROP CONSTRAINT daily_game_stories_pkey;
    ALTER TABLE public.daily_game_stories ADD CONSTRAINT daily_game_stories_pkey PRIMARY KEY (stats_date, hsid, region, game_id);
  END IF;
END $$;
