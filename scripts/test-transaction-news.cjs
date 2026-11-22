// News coverage is independent of Super Fan notification eligibility/cursors.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/lib/transactionNews.ts'), 'utf8');
let js;
try {
  js = require('typescript').transpileModule(source, {
    compilerOptions: { module: 1, target: 9 },
  }).outputText;
} catch {
  // The isolated review workspace may have Node 24 without node_modules.
  js = require('node:module').stripTypeScriptTypes(source)
    .replace(/^export\s+(?=(?:async\s+)?(?:function|const|class)\b)/gm, '')
    + '\nmodule.exports = {transactionNewsArticle, publishTransactionNews, TRANSACTION_NEWS_CANDIDATES_SQL, TRANSACTION_NEWS_INSERT_SQL};';
}
const moduleObject = { exports: {} };
vm.runInNewContext(js, { module: moduleObject, exports: moduleObject.exports, Date, console });
const { transactionNewsArticle, publishTransactionNews, TRANSACTION_NEWS_CANDIDATES_SQL, TRANSACTION_NEWS_INSERT_SQL } = moduleObject.exports;

const fixture = {
  id: '333028', yatid: 'YAT100750', player_name: 'Royce Lewis',
  first_name: 'Royce', last_name: 'Lewis', hsid: 'sample-school',
  transaction_type: 'Trade', from_team_name: 'Minnesota Twins',
  to_team_name: 'Los Angeles Dodgers', effective_date: '2026-11-20T00:00:00Z',
  mlb_person_id: '668904', to_team_level: 'MLB',
  payload: { id: 950798, person: { id: 668904, fullName: 'Royce Lewis' },
    description: 'Minnesota Twins traded 3B Royce Lewis to Los Angeles Dodgers.' },
};

async function main() {
  const article = transactionNewsArticle(fixture);
  assert.equal(article.uuid, 'mlb-transaction:333028', 'preserve existing database-row article IDs');
  assert.equal(article.playerid, fixture.yatid, 'new articles use the YAT person key');
  assert.equal(article.yatid, fixture.yatid);
  assert.equal(article.published_at, '2026-11-20T00:00:00.000Z', 'use the event date, not backfill time');
  assert.equal(article.url, 'https://www.mlb.com/transactions/2026/11/20');
  assert.equal(article.snippet, fixture.payload.description, 'keep the official transaction text');
  assert.match(article.image_url, /people\/668904\/headshot\/67\/current$/);
  assert.equal(article.verification_evidence.mlbTransactionId, 950798);
  assert.equal(article.newsworthiness, 'NORMAL');

  for (const transaction_type of ['Number Change', 'New MLB Transaction Type', 'Retired', 'Status Change']) {
    const everyType = transactionNewsArticle({ ...fixture, transaction_type });
    assert.equal(everyType.newsworthiness, 'NORMAL');
    assert.equal(everyType.sentiment, 'neutral');
  }
  const selected = transactionNewsArticle({ ...fixture, transaction_type: 'Selected' });
  assert.equal(selected.newsworthiness, 'FEATURED');
  assert.match(selected.title, /^YAT-A-BOY!/);
  assert.equal(transactionNewsArticle({ ...fixture, transaction_type: 'Selected', to_team_level: 'TRIPLE-A' }).newsworthiness, 'NORMAL');
  assert.notEqual(transactionNewsArticle({ ...fixture, id: '333029' }).uuid, article.uuid,
    'separate events with the same headline remain separate cards');
  assert.throws(() => transactionNewsArticle({ ...fixture, effective_date: 'invalid' }), /source event date/);
  assert.throws(() => transactionNewsArticle({ ...fixture, yatid: '232269' }), /verified YAT/);

  const universe = [fixture, { ...fixture, id: '333029', transaction_type: 'Number Change', effective_date: '2024-03-01T00:00:00Z' }];
  const covered = new Set();
  let selectCount = 0;
  let insertCount = 0;
  let lastArgs;
  let failNextInsert = false;
  const query = async (sql, args) => {
    if (sql === TRANSACTION_NEWS_CANDIDATES_SQL) {
      selectCount++;
      lastArgs = args;
      return { rows: universe.filter(row => !covered.has(`mlb-transaction:${row.id}`)
        && (args[1] === null || args[1].includes(row.id))).slice(0, args[0]) };
    }
    assert.equal(sql, TRANSACTION_NEWS_INSERT_SQL);
    insertCount++;
    if (failNextInsert) { failNextInsert = false; throw new Error('temporary write failure'); }
    const rows = [];
    for (const candidate of JSON.parse(args[0])) {
      if (!covered.has(candidate.uuid)) {
        covered.add(candidate.uuid);
        rows.push({ uuid: candidate.uuid, yatid: candidate.yatid, hsid: candidate.hsid });
      }
    }
    return { rows, rowCount: rows.length };
  };
  const dry = await publishTransactionNews(query, { dryRun: true });
  assert.equal(dry.considered, 2);
  assert.equal(dry.created, 0);
  assert.equal(insertCount, 0, 'preview is read-only');
  assert.equal(lastArgs[1], null, 'full backlog has no alert/date cursor');

  failNextInsert = true;
  await assert.rejects(publishTransactionNews(query), /temporary write failure/);
  assert.equal(covered.size, 0);
  const retried = await publishTransactionNews(query, { batchSize: 1 });
  assert.equal(retried.created, 1, 'failed rows are retried');
  assert.equal(retried.hasMore, true);
  const catchup = await publishTransactionNews(query);
  assert.equal(catchup.created, 1, 'old non-alert transaction types are backfilled');
  const duplicate = await publishTransactionNews(query);
  assert.equal(duplicate.created, 0, 'second run is idempotent');
  const beforeEmpty = selectCount;
  await publishTransactionNews(query, { transactionIds: [] });
  assert.equal(selectCount, beforeEmpty, 'empty explicit ID list must not start a full backfill');
  await publishTransactionNews(query, { batchSize: 99999, dryRun: true });
  assert.equal(lastArgs[0], 1000, 'each batch is bounded');
  await assert.rejects(publishTransactionNews(query, { transactionIds: ['1 OR 1=1'] }), /Invalid transaction ID/);

  assert.match(TRANSACTION_NEWS_CANDIDATES_SQL, /card\.yatid = pt\.yatid/);
  assert.match(TRANSACTION_NEWS_CANDIDATES_SQL, /identity\.mlb_id = pt\.payload#>>'\{person,id\}'/);
  assert.match(TRANSACTION_NEWS_CANDIDATES_SQL, /identity\.proven/);
  assert.match(TRANSACTION_NEWS_CANDIDATES_SQL, /yat_registry_rejections/);
  assert.doesNotMatch(TRANSACTION_NEWS_CANDIDATES_SQL, /MEANINGFUL_TYPES|created_at\s*>|interval|\.playerid\s*=/i);
  assert.match(TRANSACTION_NEWS_INSERT_SQL, /ON CONFLICT \(uuid\) DO NOTHING/);
  assert.match(TRANSACTION_NEWS_INSERT_SQL, /identity\.mlb_id = article\.raw_payload#>>'\{person,id\}'/,
    'identity is checked again by the insert');
  assert.match(TRANSACTION_NEWS_INSERT_SQL, /SOURCE_VERIFIED/);

  const route = fs.readFileSync(path.join(root, 'src/app/api/cron/mlb-transaction-news/route.ts'), 'utf8');
  assert.match(route, /import \{ writerQuery \} from '@\/lib\/dbWriter'/, 'writes use the ingest writer, not the site read-only pool');
  assert.match(route, /publishTransactionNews\(writerQuery/);
  assert.match(route, /YATSTATS_ISOLATED_PREVIEW/);
  assert.match(route, /revalidateTag\('player-profile-news', \{ expire: 0 \}\)/);
  assert.doesNotMatch(route, /revalidateTag\('player-profile',/,
    'news publication must preserve cached stats and game logs');
  assert.doesNotMatch(route + source, /sendGHLEmail|postArmsWebhook|findOrCreateGhlContact|user_favorites|UPDATE\s+public\.flip_card_front_stage/);

  // Exercise cache tagging and route invalidation, including a retry after
  // cards already committed and a later batch failed. All dependencies are
  // local fakes: these checks never reach a database or send a notification.
  const ts = require('typescript');
  function loadModule(sourceText, imports, extraGlobals = {}) {
    const m = { exports: {} };
    const compiled = ts.transpileModule(sourceText, { compilerOptions: { module: 1, target: 9 } }).outputText;
    vm.runInNewContext(compiled, { module: m, exports: m.exports, Date,
      require: name => {
        if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
        return imports[name];
      }, ...extraGlobals });
    return m.exports;
  }
  const keptCalls = [];
  const loaders = new Proxy({}, { get: () => async () => [] });
  const kept = loadModule(fs.readFileSync(path.join(root, 'src/lib/profilePageData.ts'), 'utf8'), {
    'server-only': {},
    'next/cache': { unstable_cache: (fn, keys, options) => { keptCalls.push({ keys, options }); return fn; } },
    '@/lib/queryFailureWatch': { queryFailureWatch: { run: (_watch, fn) => fn() } },
    '@/lib/cardDataTtl': { CARD_DATA_TTL_SECONDS: 3600 },
    '@/lib/db': loaders,
  });
  await kept.keptProfileNews('YAT100750');
  await kept.keptBattingStats('YAT100750');
  await kept.keptGameLogs('YAT100750');
  assert(keptCalls[0].options.tags.includes('player-profile-news'));
  assert(keptCalls[0].keys.includes('profile-news-v2'), 'old untagged news cache entries get a new key');
  for (const call of keptCalls.slice(1)) {
    assert(!call.options.tags.includes('player-profile-news'), 'stats and game logs keep their own cache');
    assert(call.options.tags.includes('player-profile'));
    assert.equal(call.options.revalidate, 3600);
  }

  const invalidations = [];
  const writes = [];
  let batches = [];
  const routeModule = loadModule(route, {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
    'next/cache': { revalidateTag: tag => invalidations.push(tag) },
    '@/lib/dbWriter': { writerQuery: async (...args) => { writes.push(args); return { rows: [] }; } },
    '@/lib/transactionNews': { publishTransactionNews: async () => {
      const batch = batches.shift();
      if (batch instanceof Error) throw batch;
      return batch || { considered: 0, created: 0, hasMore: false, samples: [] };
    } },
  }, { process: { env: { CRON_SECRET: 'local-test', VERCEL_ENV: 'production' } },
    console: { error() {} } });
  const req = dry => ({ headers: { get: () => 'Bearer local-test' },
    nextUrl: new URL(`https://example.test/api/cron/mlb-transaction-news${dry ? '?dry=1' : ''}`) });
  const zeroRowRetry = await routeModule.GET(req(false));
  assert.equal(zeroRowRetry.status, 200);
  assert.equal(zeroRowRetry.body.created, 0);
  assert.equal(invalidations.pop(), 'player-profile-news', 'zero-row retry still repairs stale news cache');
  const writesBeforeDryRun = writes.length;
  await routeModule.GET(req(true));
  assert.equal(invalidations.length, 0, 'dry run does not invalidate cache');
  assert.equal(writes.length, writesBeforeDryRun, 'dry run does not write health records');
  batches = [{ considered: 500, created: 500, hasMore: true, samples: [] }, new Error('later batch failed')];
  const partial = await routeModule.GET(req(false));
  assert.equal(partial.status, 500);
  assert.equal(partial.body.created, 500);
  assert.equal(invalidations.pop(), 'player-profile-news', 'partial publication becomes visible after a later failure');
  console.log('Transaction news: all types, event dates, YAT identity, full backlog, safe retries, and news-only publication OK');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
