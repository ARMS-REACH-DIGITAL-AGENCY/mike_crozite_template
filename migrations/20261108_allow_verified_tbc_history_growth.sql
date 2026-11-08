-- Keep the immutable 2026 minimum-completeness floor but accept verified
-- additions to the historical source tables. The original snapshot contained
-- 501,242 batting and 438,097 pitching rows; later 2026 corrections have
-- legitimately increased those counts. Requiring an exact count caused the
-- recurring TBC Players publication job to fail after completing raw promotion.
-- Preserve the currently installed function body, including its resolved
-- all-seasons views and fan-facing status guards.
DO $migration$
DECLARE current_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.prepare_tbc_verified_2026_participation()'::regprocedure
  ) INTO current_definition;

  IF strpos(current_definition,'IF v_bat<501242 OR v_pitch<438097 THEN') > 0 THEN
    RAISE NOTICE 'TBC historical growth guard already corrected';
  ELSIF strpos(current_definition,'IF v_bat<>501242 OR v_pitch<>438097 THEN') > 0 THEN
    EXECUTE replace(
      current_definition,
      'IF v_bat<>501242 OR v_pitch<>438097 THEN',
      'IF v_bat<501242 OR v_pitch<438097 THEN'
    );
    RAISE NOTICE 'Replaced stale exact archive counts with minimum verified floors';
  ELSE
    RAISE EXCEPTION
      'Unexpected historical participation guard. Stop: inspect source-authority function before editing.';
  END IF;
END $migration$;
