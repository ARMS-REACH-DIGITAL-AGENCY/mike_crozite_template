-- Restore favorite INSERTs for application roles that can write
-- public.user_favorites but cannot advance its SERIAL sequence.
--
-- The application route contains a temporary sequence-free fallback so saves
-- continue before this migration is applied. Once this migration runs, normal
-- positive SERIAL IDs are used again.

DO $$
DECLARE
  sequence_name regclass;
  login_role record;
  max_existing_id bigint;
BEGIN
  sequence_name := to_regclass('public.user_favorites_id_seq');

  IF sequence_name IS NULL THEN
    RAISE NOTICE 'public.user_favorites_id_seq does not exist; no grant applied';
    RETURN;
  END IF;

  SELECT COALESCE(MAX(id), 0)
    INTO max_existing_id
    FROM public.user_favorites;

  -- Keep the sequence ahead of existing positive IDs. Negative IDs created by
  -- the temporary application fallback do not affect the SERIAL sequence.
  PERFORM setval(
    sequence_name,
    GREATEST(max_existing_id, 1),
    max_existing_id > 0
  );

  FOR login_role IN
    SELECT rolname
      FROM pg_roles
     WHERE rolcanlogin
       AND has_table_privilege(
         rolname,
         'public.user_favorites',
         'INSERT'
       )
  LOOP
    EXECUTE format(
      'GRANT USAGE, SELECT ON SEQUENCE %s TO %I',
      sequence_name,
      login_role.rolname
    );
  END LOOP;
END
$$;
