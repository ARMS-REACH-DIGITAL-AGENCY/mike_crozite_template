-- Privileges for new isolated portal/Tribune objects only.
-- Prerequisite: an operator-created yatstats_tribune_app LOGIN role with no
-- inherited roles or elevated privileges, configured only in TRIBUNE_DATABASE_URL.
-- Never grant these records to the public Data API roles or the shared reader.
-- Existing shared ACLs/RLS/rows/definitions/triggers/schedules are untouched.
-- The only shared grants add the dedicated app role to its explicit canonical sources.
BEGIN;

DO $$
DECLARE
  server_role record;
  private_table text;
  untrusted_role text;
  owned_sequence record;
  table_privileges text;
BEGIN
  SELECT * INTO server_role FROM pg_roles WHERE rolname='yatstats_tribune_app';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Create the dedicated Tribune server role before applying this migration';
  END IF;
  IF NOT server_role.rolcanlogin OR server_role.rolsuper OR server_role.rolbypassrls
      OR server_role.rolcreaterole OR server_role.rolcreatedb OR server_role.rolreplication
      OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member=server_role.oid) THEN
    RAISE EXCEPTION 'The Tribune server role must be an unprivileged LOGIN with no inherited roles';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles r
    WHERE r.rolname IN ('anonymous','authenticated','authenticator')
      AND pg_has_role(r.oid,server_role.oid,'MEMBER')
  ) THEN
    RAISE EXCEPTION 'Public authentication roles must not be members of the Tribune server role';
  END IF;

  GRANT USAGE ON SCHEMA public TO yatstats_tribune_app;
  GRANT USAGE ON SCHEMA tribune_private TO yatstats_tribune_app;
  REVOKE CREATE ON SCHEMA tribune_private FROM yatstats_tribune_app;
  REVOKE ALL ON SCHEMA tribune_private FROM PUBLIC;
  FOR untrusted_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anonymous','authenticated','authenticator') LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA tribune_private FROM %I',untrusted_role);
  END LOOP;

  FOREACH private_table IN ARRAY ARRAY[
    'partner_portal_memberships','partner_portal_assets','partner_sponsor_order_claims',
    'school_tribune_sponsorships','tribune_sponsor_creatives','tribune_publication_settings',
    'partner_portal_audit','alumni_newsletter_editions','alumni_newsletter_control',
    'alumni_newsletter_preferences','alumni_daily_email_delivery','alumni_newsletter_cutover','publisher_notes'
  ] LOOP
    IF to_regclass(format('tribune_private.%I',private_table)) IS NULL THEN
      RAISE EXCEPTION 'Apply prerequisite migrations first: tribune_private.% is missing',private_table;
    END IF;
    IF (SELECT relowner=server_role.oid FROM pg_class WHERE oid=to_regclass(format('tribune_private.%I',private_table))) THEN
      RAISE EXCEPTION 'The application role must not own private publication table %',private_table;
    END IF;

    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE tribune_private.%I FROM PUBLIC',private_table);
    FOR untrusted_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anonymous','authenticated','authenticator') LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE tribune_private.%I FROM %I',private_table,untrusted_role);
    END LOOP;
    -- Reset this role's direct grants so a previous test or install cannot leave
    -- approval writes, snapshot edits, or deletion rights behind.
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE tribune_private.%I FROM yatstats_tribune_app',private_table);
    table_privileges := CASE private_table
      WHEN 'alumni_newsletter_control' THEN 'SELECT'
      WHEN 'alumni_newsletter_cutover' THEN 'SELECT'
      WHEN 'alumni_newsletter_editions' THEN 'SELECT, INSERT'
      WHEN 'partner_portal_assets' THEN 'SELECT, INSERT'
      WHEN 'partner_portal_audit' THEN 'SELECT, INSERT'
      ELSE 'SELECT, INSERT, UPDATE'
    END;
    EXECUTE format('GRANT %s ON TABLE tribune_private.%I TO yatstats_tribune_app',table_privileges,private_table);

    -- Explicit ACLs are the first boundary; RLS also protects against a future
    -- broad default grant or accidental reapplication of an earlier migration.
    EXECUTE format('ALTER TABLE tribune_private.%I ENABLE ROW LEVEL SECURITY',private_table);
    EXECUTE format('DROP POLICY IF EXISTS tribune_server_access ON tribune_private.%I',private_table);
    EXECUTE format('CREATE POLICY tribune_server_access ON tribune_private.%I FOR ALL TO yatstats_tribune_app USING (true) WITH CHECK (true)',private_table);

    FOR owned_sequence IN
      SELECT sequence_namespace.nspname,sequence_class.relname
      FROM pg_depend dependency
      JOIN pg_class sequence_class ON sequence_class.oid=dependency.objid AND sequence_class.relkind='S'
      JOIN pg_namespace sequence_namespace ON sequence_namespace.oid=sequence_class.relnamespace
      WHERE dependency.refobjid=to_regclass(format('tribune_private.%I',private_table))
        AND dependency.deptype IN ('a','i')
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM PUBLIC',owned_sequence.nspname,owned_sequence.relname);
      FOR untrusted_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anonymous','authenticated','authenticator') LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM %I',owned_sequence.nspname,owned_sequence.relname,untrusted_role);
      END LOOP;
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM yatstats_tribune_app',owned_sequence.nspname,owned_sequence.relname);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I.%I TO yatstats_tribune_app',owned_sequence.nspname,owned_sequence.relname);
    END LOOP;
  END LOOP;
END;
$$;

-- Only the preexisting relations used by portal service queries are added.
-- Their existing public/commerce permissions are deliberately unchanged.
GRANT SELECT ON TABLE public.school_success,public.sponsor_orders,public.school_splash_sponsorships TO yatstats_tribune_app;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sponsor_brands TO yatstats_tribune_app;
DO $$
DECLARE brand_sequence text;
BEGIN
  brand_sequence := pg_get_serial_sequence('public.sponsor_brands','id');
  IF brand_sequence IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO yatstats_tribune_app',brand_sequence);
  END IF;
END;
$$;

-- Import authority is never available to the app or browser-facing roles.
REVOKE ALL ON FUNCTION tribune_private.import_legacy_pilot(jsonb,boolean) FROM PUBLIC,yatstats_tribune_app;
REVOKE ALL ON FUNCTION tribune_private.enforce_alumni_newsletter_approval() FROM PUBLIC,yatstats_tribune_app;
DO $$
DECLARE untrusted_role text;
BEGIN
  FOR untrusted_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anonymous','authenticated','authenticator') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION tribune_private.import_legacy_pilot(jsonb,boolean) FROM %I',untrusted_role);
    EXECUTE format('REVOKE ALL ON FUNCTION tribune_private.enforce_alumni_newsletter_approval() FROM %I',untrusted_role);
  END LOOP;
END;
$$;
COMMIT;
