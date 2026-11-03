// Precompute school hostnames without changing school_success or TBC source rows.
// Explicit --apply is required. Use DATABASE_URL for the writer role, never a
// production read-only credential. Generates from the same rules as web routing.
const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

function loadRouting() {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/schoolDirectoryRouting.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(js, { exports: compiled.exports, URL, console });
  return compiled.exports;
}

function prepareEntries(mapping, normalizeSchoolHost, schoolHostnamePattern) {
  const candidate = [];
  const byHost = new Map();
  const invalid = [];
  for (const [id, url] of mapping) {
    const hostname = normalizeSchoolHost(url);
    if (!/^https:\/\//.test(url) || !schoolHostnamePattern(hostname) ||
        schoolHostnamePattern(hostname).type !== 'named' ||
        url.replace(/\/+$/, '').toLowerCase() !== 'https://' + hostname) {
      invalid.push({ id, url });
      continue;
    }
    const row = { hsid: Number(id), hostname, canonical_url: url.replace(/\/+$/, '') };
    if (!byHost.has(hostname)) byHost.set(hostname, []);
    byHost.get(hostname).push(row);
  }
  const duplicates = [];
  for (const [host, rows] of byHost) {
    if (rows.length > 1) duplicates.push({ hostname: host, hsids: rows.map(x => x.hsid) });
    else candidate.push(rows[0]);
  }
  return { entries: candidate.sort((a,b) => a.hsid - b.hsid), duplicates, invalid };
}

async function buildDirectory(client) {
  const routing = loadRouting();
  const { rows: schools } = await client.query(`
    SELECT DISTINCT hsid FROM (
      SELECT hsid::integer AS hsid FROM public.player_hsids WHERE hsid IS NOT NULL
      UNION
      SELECT hsid::integer FROM public.flip_card_front_stage
        WHERE hsid ~ '^[1-9][0-9]*$' AND hsid::numeric <= 2147483647
    ) e
    JOIN public.tbc_schools_raw t USING (hsid)
    WHERE hsid > 0 ORDER BY hsid
  `);
  const ids = schools.map(x => String(x.hsid));
  const mapping = new Map();
  const reader = async (sql, args=[]) => ({ rows: (await client.query(sql, args)).rows });
  // Chunked to avoid one large expensive SQL statement and memory spike.
  for (let i = 0; i < ids.length; i += 200) {
    const portion = await routing.canonicalSchoolUrls(ids.slice(i,i+200), reader);
    for (const [key, url] of portion) mapping.set(key,url);
  }
  return { eligible: ids.length, mapped: mapping.size, ...prepareEntries(mapping, routing.normalizeSchoolHost, routing.schoolHostnamePattern) };
}

async function run() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    // Read-only generation and validation first. Never touch legacy records.
    const data = await buildDirectory(client);
    console.log(JSON.stringify({ eligible: data.eligible, mapped: data.mapped, valid: data.entries.length,
      ambiguous: data.duplicates.length, invalid: data.invalid.length,
      examples: { ambiguous: data.duplicates.slice(0,8), invalid: data.invalid.slice(0,8) } },null,2));
    if (!data.eligible || data.mapped < data.eligible * 0.99) throw new Error('Insufficient school coverage');
    if (!apply) return;
    await client.query('BEGIN');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.school_url_directory (
          hsid integer PRIMARY KEY,
          hostname text NOT NULL UNIQUE,
          canonical_url text NOT NULL,
          generated_at timestamptz NOT NULL DEFAULT NOW()
        )
      `);
      await client.query('GRANT SELECT ON public.school_url_directory TO authenticator, yatstats_tribune_app');
      const lock = await client.query("SELECT pg_try_advisory_xact_lock(750042, 5004) AS acquired");
      if (!lock.rows[0].acquired) throw new Error('Another refresh already running');
      // Replace only the derived directory in one transaction. Readers see the
      // previous complete snapshot until commit; failures roll back.
      await client.query('DELETE FROM public.school_url_directory');
      for (let i=0; i<data.entries.length; i+=300) {
        const chunk=data.entries.slice(i,i+300);
        await client.query(`
          INSERT INTO public.school_url_directory (hsid, hostname, canonical_url, generated_at)
          SELECT hsid, hostname, canonical_url, NOW()
          FROM jsonb_to_recordset($1::jsonb) AS x(hsid integer, hostname text, canonical_url text)
        `,[JSON.stringify(chunk)]);
      }
      const check=await client.query('SELECT count(*)::integer AS count FROM public.school_url_directory');
      if (check.rows[0].count !== data.entries.length) throw new Error('Directory count mismatch');
      await client.query('COMMIT');
      console.log('APPLIED: ' + data.entries.length + ' validated hostname records');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
  } finally { client.release(); await pool.end(); }
}
if (require.main === module) run().catch(e => { console.error(e.message); process.exitCode=1; });
module.exports = { prepareEntries, buildDirectory };
