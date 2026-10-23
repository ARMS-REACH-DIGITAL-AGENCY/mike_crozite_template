/* Actual PostgreSQL privilege/RLS checks. Requires an explicit isolated database.
 * Every data probe rolls itself back; no delivery provider or email code is loaded.
 * --sql emits the three statements for a managed SQL tool. Run applicationSql as
 * yatstats_tribune_app, and the other statements as the isolated branch owner.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone verification script. */
const assert = require('node:assert/strict');

const metadataSql = `DO $$
DECLARE private_table text; untrusted_role text; owned_sequence record;
BEGIN
  FOREACH private_table IN ARRAY ARRAY[
    'partner_portal_memberships','partner_portal_assets','partner_sponsor_order_claims',
    'school_tribune_sponsorships','tribune_sponsor_creatives','tribune_publication_settings',
    'partner_portal_audit','alumni_newsletter_editions','alumni_newsletter_control',
    'alumni_newsletter_preferences','alumni_daily_email_delivery'
  ] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||private_table)) THEN
      RAISE EXCEPTION 'Private table % must have RLS enabled',private_table;
    END IF;
    FOR untrusted_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anonymous','authenticated','authenticator') LOOP
      IF has_table_privilege(untrusted_role,'public.'||private_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'Untrusted role % still has private table privileges on %',untrusted_role,private_table;
      END IF;
      FOR owned_sequence IN
        SELECT c.oid FROM pg_depend d JOIN pg_class c ON c.oid=d.objid AND c.relkind='S'
        WHERE d.refobjid=to_regclass('public.'||private_table) AND d.deptype IN ('a','i')
      LOOP
        IF has_sequence_privilege(untrusted_role,owned_sequence.oid,'USAGE,SELECT,UPDATE') THEN
          RAISE EXCEPTION 'Untrusted role % still has a private sequence privilege',untrusted_role;
        END IF;
      END LOOP;
    END LOOP;
    IF NOT has_table_privilege('yatstats_tribune_app','public.'||private_table,'SELECT') THEN
      RAISE EXCEPTION 'Application cannot read %',private_table;
    END IF;
  END LOOP;
  IF has_table_privilege('yatstats_tribune_app','public.alumni_newsletter_control','INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_table_privilege('yatstats_tribune_app','public.alumni_newsletter_editions','UPDATE,DELETE,TRUNCATE')
    OR has_table_privilege('yatstats_tribune_app','public.partner_portal_audit','UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'Application can change approval, an existing snapshot, or an audit record';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='yatstats_tribune_app'
      AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb))
    OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member='yatstats_tribune_app'::regrole) THEN
    RAISE EXCEPTION 'Application role must not have elevated or inherited roles';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.site_message_campaigns'::regclass) THEN
    RAISE EXCEPTION 'Publisher notes must have row security';
  END IF;
END;
$$;`;

const untrustedSql = `DO $$
DECLARE legacy_id bigint; note_id bigint; changed integer; denied boolean;
BEGIN
  BEGIN
    INSERT INTO public.site_message_campaigns(page_key,message_text,status)
      VALUES('tribune-privilege-legacy-test','Temporary legacy message','draft') RETURNING id INTO legacy_id;
    INSERT INTO public.site_message_campaigns(page_key,message_text,status)
      VALUES('tribune','Temporary publisher note','draft') RETURNING id INTO note_id;
    SET LOCAL ROLE authenticated;
    IF EXISTS (SELECT 1 FROM public.site_message_campaigns WHERE id=note_id) THEN
      RAISE EXCEPTION 'Authenticated role can read a private publisher note';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.site_message_campaigns WHERE id=legacy_id) THEN
      RAISE EXCEPTION 'Legacy message read behavior changed';
    END IF;
    UPDATE public.site_message_campaigns SET message_text='Legacy edit remains allowed' WHERE id=legacy_id;
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed<>1 THEN RAISE EXCEPTION 'Legacy message update behavior changed'; END IF;
    UPDATE public.site_message_campaigns SET message_text='Unauthorized edit' WHERE id=note_id;
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed<>0 THEN RAISE EXCEPTION 'Authenticated role changed a publisher note'; END IF;
    DELETE FROM public.site_message_campaigns WHERE id=note_id;
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed<>0 THEN RAISE EXCEPTION 'Authenticated role deleted a publisher note'; END IF;

    denied:=false;
    BEGIN
      INSERT INTO public.site_message_campaigns(page_key,message_text) VALUES('tribune','Unauthorized note');
    EXCEPTION WHEN insufficient_privilege THEN denied:=true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'Authenticated role inserted a publisher note'; END IF;
    denied:=false;
    BEGIN
      UPDATE public.site_message_campaigns SET page_key='tribune' WHERE id=legacy_id;
    EXCEPTION WHEN insufficient_privilege THEN denied:=true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'Authenticated role converted a legacy message to a publisher note'; END IF;
    denied:=false;
    BEGIN
      PERFORM 1 FROM public.alumni_newsletter_editions LIMIT 1;
    EXCEPTION WHEN insufficient_privilege THEN denied:=true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'Authenticated role can read private edition snapshots'; END IF;
    denied:=false;
    BEGIN
      UPDATE public.alumni_newsletter_control SET enabled=enabled;
    EXCEPTION WHEN insufficient_privilege THEN denied:=true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'Authenticated role can update delivery approval'; END IF;
    RESET ROLE;
    -- This successful-path exception rolls back every fixture in this block.
    RAISE EXCEPTION USING ERRCODE='YT001',MESSAGE='Privilege probes passed; discard fixtures';
  EXCEPTION WHEN SQLSTATE 'YT001' THEN NULL;
  END;
END;
$$;`;

const applicationSql = `DO $$
DECLARE note_id bigint; changed integer; denied boolean;
BEGIN
  IF current_user<>'yatstats_tribune_app' THEN RAISE EXCEPTION 'Run applicationSql as the dedicated application role'; END IF;
  BEGIN
    PERFORM enabled,approved_layout_version FROM public.alumni_newsletter_control WHERE singleton=true;
    PERFORM id FROM public.alumni_newsletter_editions LIMIT 1;
    INSERT INTO public.partner_portal_memberships(firebase_uid,role,created_by)
      VALUES('tribune-privilege-test-'||gen_random_uuid()::text,'publisher','isolated-privilege-test');
    INSERT INTO public.partner_portal_assets(kind,url,width,height,created_by)
      VALUES('notice','https://example.invalid/privilege-test-'||gen_random_uuid()::text||'.png',10,10,'isolated-privilege-test');
    INSERT INTO public.partner_portal_audit(actor_uid,action,entity_type,entity_id)
      VALUES('isolated-privilege-test','verify','note','test');
    INSERT INTO public.site_message_campaigns(page_key,message_text,status)
      VALUES('tribune','Temporary application publisher note','draft') RETURNING id INTO note_id;
    IF NOT EXISTS (SELECT 1 FROM public.site_message_campaigns WHERE id=note_id) THEN
      RAISE EXCEPTION 'Application cannot read its publisher note';
    END IF;
    UPDATE public.site_message_campaigns SET message_text='Temporary revised note',revision=revision+1 WHERE id=note_id;
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed<>1 THEN RAISE EXCEPTION 'Application cannot update its publisher note'; END IF;
    denied:=false;
    BEGIN
      UPDATE public.alumni_newsletter_control SET enabled=enabled;
    EXCEPTION WHEN insufficient_privilege THEN denied:=true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'Application can approve its own delivery'; END IF;
    denied:=false;
    BEGIN
      UPDATE public.alumni_newsletter_editions SET edition=edition WHERE false;
    EXCEPTION WHEN insufficient_privilege THEN denied:=true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'Application can edit saved editions'; END IF;
    denied:=false;
    BEGIN
      DELETE FROM public.site_message_campaigns WHERE id=note_id;
    EXCEPTION WHEN insufficient_privilege THEN denied:=true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'Application has unnecessary publisher-note delete rights'; END IF;
    RAISE EXCEPTION USING ERRCODE='YT001',MESSAGE='Application probes passed; discard fixtures';
  EXCEPTION WHEN SQLSTATE 'YT001' THEN NULL;
  END;
END;
$$;`;

if (process.argv.includes('--sql')) {
  console.log(JSON.stringify({ metadataSql, untrustedSql, applicationSql }));
} else {
  const connectionString = process.env.PARTNER_TEST_DATABASE_URL;
  if (!connectionString) {
    console.error('Refusing to run: set PARTNER_TEST_DATABASE_URL to an isolated database owner connection. No production fallback is used.');
    process.exit(1);
  }
  const { Client } = require('pg');
  const client = new Client({ connectionString, connectionTimeoutMillis: 15000, application_name: 'tribune-privilege-verification' });
  (async () => {
    try {
      await client.connect();
      await client.query('BEGIN');
      await client.query(metadataSql);
      await client.query(untrustedSql);
      // Only the isolated test owner needs SET permission on this role. The
      // application role itself must have no inherited role memberships.
      await client.query('SET LOCAL ROLE yatstats_tribune_app');
      await client.query(applicationSql);
      const result = await client.query('SELECT current_user AS role');
      assert.equal(result.rows[0].role, 'yatstats_tribune_app');
      console.log('PASS: private table/sequence ACLs, legacy-note preservation, note RLS, dedicated app writes, immutable snapshots and delivery approval isolation. All data probes rolled back.');
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      await client.end();
    }
  })().catch((error) => {
    console.error('Privilege verification failed.', { code: error.code || 'unknown' });
    process.exitCode = 1;
  });
}
