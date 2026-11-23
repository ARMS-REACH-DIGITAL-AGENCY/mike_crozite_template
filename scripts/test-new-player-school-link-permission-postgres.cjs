'use strict';
// Execute the production publication SQL and school-link trigger as the
// application role. Owner-only tests cannot detect this permissions failure.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('migrations/20261123_new_player_school_link_permission.sql');
const schoolLinks = read('migrations/20261118_yat_step8_school_links.sql');

function segment(source, opening, closing) {
  const start = source.indexOf(opening);
  const end = source.indexOf(closing, start + opening.length);
  assert(start >= 0 && end > start, 'Missing production SQL: ' + opening);
  return source.slice(start, end + closing.length);
}

function publicationSql() {
  const file = 'src/lib/publishNewPlayer.ts';
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const initializers = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
        node.name.text === 'sql' && node.initializer) {
      initializers.push(node.initializer.getText(source));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(initializers.length, 1, 'Exactly one actual new-player SQL statement must be tested');
  return vm.runInNewContext('(' + initializers[0] + ')', {}, { timeout: 1500 });
}

// Extract the real objects rather than reproducing the faulty trigger logic.
const schoolLinkTable = segment(schoolLinks,
  'CREATE TABLE IF NOT EXISTS public.yat_school_links (', '\n);');
const lateRegistrationTrigger = segment(schoolLinks,
  'CREATE OR REPLACE FUNCTION public.trg_yat_school_links_fill_yatid()',
  'FOR EACH STATEMENT EXECUTE FUNCTION public.trg_yat_school_links_fill_yatid();');
const resolveYatId = segment(read('migrations/20261118_yat_step3_yatid_columns.sql'),
  'CREATE OR REPLACE FUNCTION public.yat_id_for(p text)', '$f$;');

const fixture = `
CREATE ROLE authenticator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT USAGE ON SCHEMA public TO authenticator;
CREATE TABLE public.school_success (hsid integer PRIMARY KEY);
CREATE TABLE public.yat_player_id_counter (id integer PRIMARY KEY, last_assigned integer NOT NULL);
CREATE TABLE public.teamid_universe_mapping (
  teamid text PRIMARY KEY, current_team_name text,
  level_label text, current_org_or_conference_name text
);
CREATE TABLE public.tbc_players_raw (playerid text PRIMARY KEY, firstname text, lastname text);
CREATE TABLE public.player_hsids (playerid text, hsid integer);
CREATE TABLE public.flip_card_front_stage (
  playerid text PRIMARY KEY, yatid text UNIQUE, hsid text,
  first_name text, last_name text, display_name text, class_of text, position text,
  status_label text, display_status_label text, level_label text, display_level_label text,
  roster_years text[], roster_years_count integer,
  current_team_name text, current_teamid text, current_org_or_conference_name text,
  source_notes text, source_summary jsonb,
  committed_teamid text, committed_team_name text, committed_level_label text,
  committed_org_or_conference_name text, committed_source text, committed_at timestamptz
);
INSERT INTO public.school_success VALUES (91001);
INSERT INTO public.yat_player_id_counter VALUES (1, 700000);
`;

const fields = {
  first_name: 'Fixture', last_name: 'Retired', class_of: '2016', position: 'P',
  roster_years: ['2015', '2016'], status_label: 'RETIRED', level_label: 'SINGLE-A',
};
const params = [
  '91001', fields.first_name, fields.last_name, fields.class_of, fields.position,
  fields.status_label, fields.level_label, null, null, null, fields.roster_years,
  'fixture-submission', JSON.stringify(fields), '', ['NCAA-D1'],
];

async function state(db) {
  return (await db.query(`
    SELECT (SELECT last_assigned FROM public.yat_player_id_counter WHERE id=1) AS counter,
           (SELECT count(*)::integer FROM public.flip_card_front_stage) AS cards,
           (SELECT count(*)::integer FROM public.yat_registry) AS people,
           (SELECT count(*)::integer FROM public.yat_registry_ids) AS source_ids
  `)).rows[0];
}

async function expectDenied(db, sql, values = [], code = '42501', errorPattern = null) {
  await db.query('SAVEPOINT denied_operation');
  await db.query('SET LOCAL ROLE authenticator');
  try {
    await assert.rejects(db.query(sql, values), error =>
      error.code === code && (!errorPattern || errorPattern.test(error.message)),
    'Application-role operation must fail with SQLSTATE ' + code);
  } finally {
    await db.query('ROLLBACK TO SAVEPOINT denied_operation');
    await db.query('RELEASE SAVEPOINT denied_operation');
  }
}

async function assertNarrowPrivileges(db) {
  const { rows: [privileges] } = await db.query(`
    SELECT has_table_privilege('authenticator','public.yat_school_links','SELECT') AS can_read,
      has_column_privilege('authenticator','public.yat_school_links','yatid','UPDATE') AS can_fill_yatid,
      has_table_privilege('authenticator','public.yat_school_links','UPDATE') AS can_update_all,
      has_table_privilege('authenticator','public.yat_school_links','INSERT') AS can_insert,
      has_table_privilege('authenticator','public.yat_school_links','DELETE') AS can_delete,
      has_table_privilege('authenticator','public.yat_school_links','TRUNCATE') AS can_truncate,
      has_column_privilege('authenticator','public.yat_school_links','hsid','UPDATE') AS can_change_school,
      has_column_privilege('authenticator','public.yat_school_links','source','UPDATE') AS can_change_source,
      has_column_privilege('authenticator','public.yat_school_links','source_player_id','UPDATE') AS can_change_source_id,
      (SELECT prosecdef FROM pg_proc
        WHERE oid='public.trg_yat_school_links_fill_yatid()'::regprocedure) AS security_definer,
      (SELECT rolsuper FROM pg_roles WHERE rolname='authenticator') AS superuser
  `);
  assert.deepEqual(privileges, {
    can_read: true, can_fill_yatid: true, can_update_all: false,
    can_insert: false, can_delete: false, can_truncate: false,
    can_change_school: false, can_change_source: false, can_change_source_id: false,
    security_definer: false, superuser: false,
  }, 'Only the YAT ID column update permission may be added');
}

async function run() {
  assert.equal(process.env.YATSTATS_SQL_FIXTURE, 'isolated-local-postgres', 'Isolated fixture required');
  const host = process.env.PGHOST || '127.0.0.1';
  const database = process.env.PGDATABASE || 'yatstats_ci';
  assert(['localhost', '127.0.0.1', '::1'].includes(host), 'Remote database prohibited');
  assert(/^yatstats_ci(?:_[a-z0-9_]+)?$/.test(database), 'Dedicated CI database required');
  const db = new Client({
    host, database, port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres', password: process.env.PGPASSWORD,
  });
  const sql = publicationSql();
  await db.connect();
  try {
    const existing = (await db.query(`
      SELECT to_regclass('public.yat_registry') AS registry,
             to_regclass('public.flip_card_front_stage') AS cards,
             EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticator') AS app_role
    `)).rows[0];
    assert.deepEqual(existing, { registry: null, cards: null, app_role: false },
      'Refusing to alter a database or role that was not created by this fixture');
    await db.query('BEGIN');
    await db.query(fixture);
    await db.query(read('migrations/20261109_yat_registry.sql'));
    await db.query(schoolLinkTable);
    await db.query(resolveYatId);
    await db.query(lateRegistrationTrigger);
    await db.query(`
      GRANT SELECT ON public.school_success, public.teamid_universe_mapping,
        public.tbc_players_raw, public.player_hsids, public.yat_school_links TO authenticator;
      GRANT SELECT, UPDATE ON public.yat_player_id_counter TO authenticator;
      GRANT SELECT, INSERT ON public.flip_card_front_stage,
        public.yat_registry, public.yat_registry_ids TO authenticator;
    `);

    // An empty school-link table still checks the invoker's UPDATE privilege.
    const initial = await state(db);
    await expectDenied(db, sql, params, '42501', /permission denied for table yat_school_links/);
    assert.deepEqual(await state(db), initial,
      'Failed publication must roll back the counter, card, person and source ID');
    console.log('PASS: actual new-player SQL reproduces 42501 and leaves no partial identity');

    await db.query(migration);
    await assertNarrowPrivileges(db);
    await db.query('SET LOCAL ROLE authenticator');
    const created = await db.query(sql, params);
    await db.query('RESET ROLE');
    assert.equal(created.rows.length, 1);
    assert.equal(created.rows[0].playerid, 'YAT700001');
    const saved = (await db.query(`
      SELECT yatid,hsid,first_name,last_name,class_of,position,status_label,level_label,
        roster_years,roster_years_count,current_teamid,committed_teamid,source_summary
      FROM public.flip_card_front_stage WHERE playerid='YAT700001'
    `)).rows[0];
    assert.deepEqual(saved, {
      yatid: 'YAT700001', hsid: '91001', ...fields, roster_years_count: 2,
      current_teamid: null, committed_teamid: null,
      source_summary: { source: 'contribute', submission_id: 'fixture-submission', submitted_fields: fields },
    });
    assert.deepEqual(await state(db), { counter: 700001, cards: 1, people: 1, source_ids: 1 });
    const once = await state(db);
    await db.query('SET LOCAL ROLE authenticator');
    assert.equal((await db.query(sql, params)).rows.length, 0, 'Duplicate name and school must not allocate another identity');
    await db.query('RESET ROLE');
    assert.deepEqual(await state(db), once, 'Duplicate submission must not advance the counter');
    console.log('PASS: retired player with no team saves once; duplicate does not reallocate');

    await db.query(`
      INSERT INTO public.yat_registry(yatid,first_name,last_name) VALUES ('YAT700010','Late','Registration');
      INSERT INTO public.yat_school_links(source,source_player_id,hsid,yatid,method) VALUES
        ('tbc','fixture-late',91001,NULL,'fixture'),
        ('tbc','fixture-unrelated',91001,NULL,'fixture'),
        ('tbc','fixture-resolved',91001,'YAT700001','fixture');
    `);
    await db.query('SET LOCAL ROLE authenticator');
    await db.query(`INSERT INTO public.yat_registry_ids(yatid,source,source_id)
      VALUES ('YAT700010','tbc','fixture-late')`);
    await db.query('RESET ROLE');
    assert.deepEqual((await db.query(`
      SELECT source_player_id,yatid FROM public.yat_school_links ORDER BY source_player_id
    `)).rows, [
      { source_player_id: 'fixture-late', yatid: 'YAT700010' },
      { source_player_id: 'fixture-resolved', yatid: 'YAT700001' },
      { source_player_id: 'fixture-unrelated', yatid: null },
    ], 'The actual trigger must fill only the newly registered, previously unresolved link');
    console.log('PASS: late source registration fills its school link without changing other links');

    for (const column of ['hsid', 'source', 'source_player_id']) {
      await expectDenied(db, `UPDATE public.yat_school_links SET ${column}=${column} WHERE false`);
    }
    await expectDenied(db, `INSERT INTO public.yat_school_links(source,source_player_id,hsid,method)
      VALUES ('card','forbidden',91001,'fixture')`);
    await expectDenied(db, 'DELETE FROM public.yat_school_links WHERE false');
    const beforeRepeat = await state(db);
    await db.query(migration);
    await assertNarrowPrivileges(db);
    assert.deepEqual(await state(db), beforeRepeat, 'Reapplying the grant must not change any identity');
    console.log('PASS: school/source writes, insert and delete stay denied; migration is repeatable');
  } finally {
    // Role, schema objects, grants and fixture rows are all transactional.
    await db.query('ROLLBACK').catch(() => {});
    await db.end();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
