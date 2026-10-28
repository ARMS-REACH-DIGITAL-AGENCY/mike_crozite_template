/* Isolated PostgreSQL cutover regression. Every fixture and gate change rolls
 * back inside the SQL block. No sender, CRM or provider code is loaded.
 * --sql emits one owner-only statement for a managed SQL runner.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone database verification. */
const sql = `DO $$
DECLARE
  suffix text:=gen_random_uuid()::text;
  opted_in text; protected text; opted_out text; missing text;
  email_in text; email_protected text; email_out text; email_missing text;
  pilot jsonb; result jsonb; denied boolean; changed integer;
BEGIN
  IF EXISTS (SELECT 1 FROM tribune_private.alumni_newsletter_control WHERE singleton=true AND enabled=true)
     OR EXISTS (SELECT 1 FROM tribune_private.alumni_newsletter_cutover) THEN
    RAISE EXCEPTION 'Run cutover probes on a fresh held isolated branch only';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.alumni_newsletter_control WHERE singleton=true AND enabled=false) THEN
    RAISE EXCEPTION 'Legacy sender must already be held; the test will not change it';
  END IF;
  opted_in:='cutover-in-'||suffix; protected:='cutover-protected-'||suffix;
  opted_out:='cutover-out-'||suffix; missing:='cutover-missing-'||suffix;
  email_in:=opted_in||'@example.invalid'; email_protected:=protected||'@example.invalid';
  email_out:=opted_out||'@example.invalid'; email_missing:=missing||'@example.invalid';
  pilot:=jsonb_build_array(
    jsonb_build_object('firebase_uid',opted_in,'email',email_in),
    jsonb_build_object('firebase_uid',protected,'email',email_protected),
    jsonb_build_object('firebase_uid',opted_out,'email',email_out),
    jsonb_build_object('firebase_uid',missing,'email',email_missing));
  BEGIN
    INSERT INTO public.user_profiles(firebase_uid,email) VALUES
      (opted_in,email_in),(protected,email_protected),(opted_out,email_out),(missing,email_missing);
    INSERT INTO public.alumni_newsletter_preferences(firebase_uid,cadence,format,subscribed) VALUES
      (opted_in,'weekly','text',true),(protected,'daily','html',true),(opted_out,'daily','text',false);
    INSERT INTO tribune_private.alumni_newsletter_preferences(firebase_uid,cadence,format,subscribed)
      VALUES(protected,'weekly','text',false);
    INSERT INTO public.alumni_daily_email_delivery(report_date,recipient_email,status,error_detail) VALUES
      ('1900-01-01',email_in,'queued',NULL),('1900-01-02',email_in,'failed','Old provider failure'),
      ('1900-01-03',email_in,'unknown_prior_attempt',NULL);
    INSERT INTO tribune_private.alumni_daily_email_delivery(report_date,recipient_email,status,error_detail)
      VALUES('1900-01-02',email_in,'failed','Newer private record');

    denied:=false;
    BEGIN PERFORM tribune_private.import_legacy_pilot(pilot,false);
    EXCEPTION WHEN raise_exception THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'Cutover accepted undrained legacy paths'; END IF;
    denied:=false;
    BEGIN PERFORM tribune_private.import_legacy_pilot('[]'::jsonb,true);
    EXCEPTION WHEN raise_exception THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'Cutover accepted an empty audience'; END IF;
    denied:=false;
    BEGIN PERFORM tribune_private.import_legacy_pilot(pilot||pilot,true);
    EXCEPTION WHEN raise_exception THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'Cutover accepted an oversized/duplicate audience'; END IF;
    denied:=false;
    BEGIN PERFORM tribune_private.import_legacy_pilot(jsonb_build_array(jsonb_build_object('firebase_uid',opted_in,'email',email_out)),true);
    EXCEPTION WHEN raise_exception THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'Cutover accepted a mismatched canonical identity'; END IF;

    result:=tribune_private.import_legacy_pilot(pilot,true);
    IF result->>'status'<>'imported' OR (result->>'preferences')::integer<>2 OR (result->>'attempts')::integer<>2 THEN
      RAISE EXCEPTION 'Cutover did not preserve existing private records while importing the verified source';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tribune_private.alumni_newsletter_preferences
      WHERE firebase_uid=opted_in AND cadence='weekly' AND format='text' AND subscribed=true)
      OR NOT EXISTS (SELECT 1 FROM tribune_private.alumni_newsletter_preferences
      WHERE firebase_uid=protected AND cadence='weekly' AND format='text' AND subscribed=false)
      OR NOT EXISTS (SELECT 1 FROM tribune_private.alumni_newsletter_preferences
      WHERE firebase_uid=opted_out AND subscribed=false) THEN
      RAISE EXCEPTION 'Cutover changed consent or cadence/format choices';
    END IF;
    IF EXISTS (SELECT 1 FROM tribune_private.alumni_newsletter_preferences WHERE firebase_uid=missing) THEN
      RAISE EXCEPTION 'Cutover inferred subscription from an account with no consent record';
    END IF;
    IF (SELECT count(*) FROM tribune_private.alumni_daily_email_delivery WHERE recipient_email=email_in)<>3
      OR NOT EXISTS (SELECT 1 FROM tribune_private.alumni_daily_email_delivery
        WHERE recipient_email=email_in AND report_date='1900-01-02' AND error_detail='Newer private record') THEN
      RAISE EXCEPTION 'Prior delivery attempts or a newer private record were lost';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tribune_private.alumni_newsletter_control
      WHERE singleton=true AND enabled=false AND approved_layout_version IS NULL AND cutover_complete_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Copying history approved or enabled delivery';
    END IF;
    -- Preserve a later unsubscribe even though the old source still says true.
    UPDATE tribune_private.alumni_newsletter_preferences SET subscribed=false WHERE firebase_uid=opted_in;
    result:=tribune_private.import_legacy_pilot(pilot,true);
    IF result->>'status'<>'already_complete' OR EXISTS (SELECT 1 FROM tribune_private.alumni_newsletter_preferences WHERE firebase_uid=opted_in AND subscribed=true) THEN
      RAISE EXCEPTION 'Repeated cutover overwrote a later unsubscribe';
    END IF;
    denied:=false;
    BEGIN PERFORM tribune_private.import_legacy_pilot(pilot-0,true);
    EXCEPTION WHEN raise_exception THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'Repeated cutover accepted a changed audience'; END IF;

    -- An owner may retain historical sending attempts without enabling mail.
    PERFORM set_config('tribune.private_legacy_import','on',true);
    INSERT INTO tribune_private.alumni_daily_email_delivery(report_date,recipient_email,status)
      VALUES('1900-01-04',email_in,'sending');
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed<>1 THEN RAISE EXCEPTION 'Owner cannot retain an in-flight historical attempt'; END IF;
    PERFORM set_config('tribune.private_legacy_import','off',true);
    SET LOCAL ROLE yatstats_tribune_app;
    INSERT INTO tribune_private.alumni_daily_email_delivery(report_date,recipient_email,status,template_version)
      VALUES('1900-02-01',email_in,'sending','cutover-test');
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed<>0 THEN RAISE EXCEPTION 'Completed cutover alone enabled a send claim'; END IF;
    RESET ROLE;
    -- Temporary private approval exercises the replacement gate entirely inside
    -- this rollback-only block. No delivery provider is invoked.
    UPDATE tribune_private.alumni_newsletter_control SET enabled=true,approved_layout_version='cutover-test' WHERE singleton=true;
    SET LOCAL ROLE yatstats_tribune_app;
    INSERT INTO tribune_private.alumni_daily_email_delivery(report_date,recipient_email,status,template_version)
      VALUES('1900-02-01',email_in,'sending','wrong-version');
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed<>0 THEN RAISE EXCEPTION 'Wrong layout claimed a delivery'; END IF;
    INSERT INTO tribune_private.alumni_daily_email_delivery(report_date,recipient_email,status,template_version)
      VALUES('1900-02-01',email_in,'sending','cutover-test');
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed<>1 THEN RAISE EXCEPTION 'Explicit private approval did not authorize a matching claim'; END IF;
    INSERT INTO tribune_private.alumni_daily_email_delivery(report_date,recipient_email,status,template_version)
      VALUES('1900-01-01',email_in,'sending','cutover-test') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed<>0 THEN RAISE EXCEPTION 'Copied history allowed a duplicate claim'; END IF;
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE='YT001',MESSAGE='Cutover probes passed; discard every fixture';
  EXCEPTION WHEN SQLSTATE 'YT001' THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE firebase_uid=ANY(ARRAY[opted_in,protected,opted_out,missing]))
    OR EXISTS (SELECT 1 FROM tribune_private.alumni_newsletter_cutover)
    OR EXISTS (SELECT 1 FROM tribune_private.alumni_newsletter_control WHERE enabled=true OR cutover_complete_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Cutover probes left fixture or approval state behind';
  END IF;
END;
$$;`;

if (process.argv.includes('--sql')) {
  process.stdout.write(JSON.stringify(sql));
} else {
  const connectionString = process.env.PARTNER_TEST_DATABASE_URL;
  if (!connectionString) {
    console.error('Refusing to run without an explicit isolated PARTNER_TEST_DATABASE_URL.');
    process.exit(1);
  }
  const { Client } = require('pg');
  const client = new Client({ connectionString, connectionTimeoutMillis: 15000 });
  (async () => {
    try {
      await client.connect(); await client.query(sql);
      console.log('PASS: verified one-time held cutover, explicit consent, newer unsubscribe preservation, attempt history, duplicate prevention and private approval. All fixtures rolled back.');
    } finally { await client.end(); }
  })().catch((error) => { console.error('Cutover verification failed.', { code: error.code || 'unknown' }); process.exitCode = 1; });
}
