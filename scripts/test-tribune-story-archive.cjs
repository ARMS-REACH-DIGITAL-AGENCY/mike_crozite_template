/* Offline checks: narrative fact boundary and private/public edition separation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let queries = [], queryImpl = async () => ({ rows: [], rowCount: 0 });
let modelCalls = 0, modelReply = null, modelError = false;
class OfflineAnthropic {
  constructor() { this.messages = { create: async () => { modelCalls++; if (modelError) throw Error('offline provider failure'); return { content: [{ type: 'text', text: JSON.stringify(modelReply) }] }; } }; }
}
const cache = new Map();
function load(filename) {
  filename = path.resolve(root, filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const req = (id) => {
    if (id === '@/lib/db') throw new Error('Private editions must not use the shared database.');
    if (id === '@/lib/tribune/db') return { query: async (...args) => { queries.push(args); return queryImpl(...args); } };
    if (id === '@anthropic-ai/sdk') return OfflineAnthropic;
    if (id.startsWith('@/')) return load(path.join(root, 'src', id.slice(2)) + '.ts');
    if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id) + '.ts');
    return require(id);
  };
  new Function('require', 'module', 'exports', source)(req, mod, mod.exports);
  return mod.exports;
}
const story = load('src/lib/tribune/story.ts');
const archive = load('src/lib/tribune/archive.ts');
const preferences = load('src/lib/tribune/preferences.ts');
const { TRIBUNE_LAYOUT_VERSION } = load('src/lib/tribune/types.ts');
const side = (id, name, total) => ({ schoolId: id, name, abbreviation: name, runs: [total], total, opsPlus: [], fipMinus: [], clubRecord: [2, 1] });
const fixture = {
  layoutVersion: TRIBUNE_LAYOUT_VERSION, preview: false, dataStatus: 'verified', generatedAt: '2027-02-08T11:00:00Z',
  school: { id: '1', name: 'Home School', location: 'Test City' }, recipientTier: 'superfan',
  period: { cadence: 'weekly', start: '2027-02-01', end: '2027-02-07', label: 'February 1–7, 2027' },
  matchup: { gameId: 'sample', round: 1, game: 1, week: 1, start: '2027-02-01', end: '2027-02-07', status: 'final', home: side('1', 'Home School', 6), away: side('2', 'Other School', 3), inningStates: [] },
  homeRoster: { playerCount: 2, title: 'Home School', batting: { kind: 'batting', rows: [{ id: 'a', name: 'Hometown Batter', state: 'played', cells: ['135', '2-1', '12', '5', '1', '0', '1', '2', '0', '0', '.500', '.750', '1.250'] }], totals: [] }, pitching: { kind: 'pitching', rows: [{ id: 'b', name: 'Hometown Pitcher', state: 'played', cells: ['75', '2-1', '6.0', '3', '1', '1', '0', '1', '0', '7', '.667', '7.00', '2.14'] }], totals: [] } },
  follows: { playerCount: 1, title: 'Private Follow Choice', batting: { rows: [{ name: 'Private Follow Name' }] }, pitching: { rows: [] } },
  sponsor: { id: 'sample-sponsor', name: 'Sample Sponsor' },
  links: { hub: 'https://1.yatstats.com/', tournament: 'https://1.yatstats.com/#sec-fantasy', share: 'https://1.yatstats.com/#sec-fantasy',
    web: 'https://1.yatstats.com/?private-web-secret', text: 'https://1.yatstats.com/?private-text-secret',
    preferences: 'https://1.yatstats.com/?private-preferences-secret', unsubscribe: 'https://1.yatstats.com/?private-unsubscribe-secret',
    officialRules: 'https://1.yatstats.com/rules', sponsorInquiry: 'https://yatstats.com/partners/' },
  sender: { name: 'YAT?STATS', postalAddress: 'Test postal address' },
};
fixture.story = story.factualTribuneStory(fixture);
const facts = story.tribuneStoryFacts(fixture), palette = story.tribuneStoryPalette(fixture);
const plan = (p = palette) => ({ headlineId: p.headlines.at(-1).id, introId: p.intros[2].id, bridgeId: p.bridges.at(-1).id, closerId: p.closers[4].id, factOrder: ['pit_leader', 'bat_leader', 'scope'] });
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS', name); }
async function main() {
  await test('publisher plan preserves every factual sentence exactly', () => {
    const output = story.validateTribuneAiStory(plan(), facts, palette);
    assert.equal(output.source, 'ai'); assert.equal(output.deck, facts.result);
    for (const key of ['scope', 'bat_leader', 'pit_leader']) assert.ok(output.paragraphs.join(' ').includes(facts[key]));
    assert.equal(output.headline, palette.headlines.at(-1).text);
  });
  await test('numeric-free fabricated play-by-play is rejected', () => {
    const bad = { headline: 'A night for the ages', deck: '{{result}}', paragraphs: ['{{scope}} {{bat_leader}} {{pit_leader}}', 'Mike Trout delivered a walk-off grand slam and the crowd roared.'] };
    assert.equal(story.validateTribuneAiStory(bad, facts, palette), null);
  });
  await test('extra prose cannot hide beside a valid publication plan', () => assert.equal(story.validateTribuneAiStory({ ...plan(), prose: 'An invented injury changed everything.' }, facts, palette), null));
  await test('unapproved raw prose cannot replace a phrase ID', () => assert.equal(story.validateTribuneAiStory({ ...plan(), introId: 'A grand slam won the real game.' }, facts, palette), null));
  await test('IDs from another phrase category cannot be substituted', () => assert.equal(story.validateTribuneAiStory({ ...plan(), headlineId: palette.intros[0].id }, facts, palette), null));
  await test('missing and duplicate factual keys rejected', () => {
    assert.equal(story.validateTribuneAiStory({ ...plan(), factOrder: ['scope', 'bat_leader'] }, facts, palette), null);
    assert.equal(story.validateTribuneAiStory({ ...plan(), factOrder: ['scope', 'bat_leader', 'bat_leader'] }, facts, palette), null);
  });
  await test('unknown factual keys cannot inject names or events', () => assert.equal(story.validateTribuneAiStory({ ...plan(), factOrder: ['scope', 'bat_leader', 'invented_win'] }, facts, palette), null));
  await test('published paragraph is assembled only from selected safe phrases and source facts', () => {
    const p = plan(); const output = story.validateTribuneAiStory(p, facts, palette);
    assert.deepEqual(output.paragraphs, [palette.intros[2].text + ' ' + facts.pit_leader, palette.bridges.at(-1).text + ' ' + facts.bat_leader + ' ' + facts.scope, palette.closers[4].text]);
  });
  await test('recurring editions have a broad palette of combinations', () => { for (const list of Object.values(palette)) assert.ok(list.length >= 8); });
  await test('win language is available only for a final win', () => {
    assert.ok(palette.headlines.some(p => p.id.startsWith('headline.win.')));
    const live = story.tribuneStoryPalette({ ...fixture, matchup: { ...fixture.matchup, status: 'live' } });
    assert.ok(live.headlines.some(p => p.id.startsWith('headline.live-lead.')));
    assert.equal(live.headlines.some(p => p.id.startsWith('headline.win.')), false);
    assert.equal(story.validateTribuneAiStory(plan(), facts, live), null);
  });
  await test('loss, live trail, tie and upcoming select their grounded outcome palettes', () => {
    const lost = { ...fixture, matchup: { ...fixture.matchup, home: side('1', 'Home School', 2) } };
    assert.ok(story.tribuneStoryPalette(lost).headlines.some(p => p.id.startsWith('headline.loss.')));
    assert.ok(story.tribuneStoryPalette({ ...lost, matchup: { ...lost.matchup, status: 'live' } }).headlines.some(p => p.id.startsWith('headline.live-trail.')));
    assert.ok(story.tribuneStoryPalette({ ...fixture, matchup: { ...fixture.matchup, home: side('1', 'Home School', 3) } }).headlines.some(p => p.id.startsWith('headline.final-tie.')));
    assert.ok(story.tribuneStoryPalette({ ...fixture, matchup: { ...fixture.matchup, status: 'upcoming' } }).headlines.some(p => p.id.startsWith('headline.upcoming.')));
  });
  await test('unrelated or unavailable matchup cannot enable outcome claims', () => {
    const unrelatedEdition = { ...fixture, school: { ...fixture.school, id: '999' } };
    const unrelated = story.tribuneStoryPalette(unrelatedEdition);
    const missing = story.tribuneStoryPalette({ ...fixture, matchup: undefined });
    assert.equal(unrelated.headlines.length, missing.headlines.length);
    assert.equal(unrelated.headlines.some(p => p.id.startsWith('headline.win.')), false);
    assert.match(story.tribuneStoryFacts(unrelatedEdition).result, /No result has been inferred/);
  });
  await test('no-appearance report requires only scope, with no invented player leader', () => {
    const noPlay = { ...fixture, homeRoster: { ...fixture.homeRoster, batting: { rows: [] }, pitching: { rows: [] } } };
    const f = story.tribuneStoryFacts(noPlay), p = story.tribuneStoryPalette(noPlay);
    assert.equal('bat_leader' in f, false); assert.equal('pit_leader' in f, false);
    assert.ok(story.validateTribuneAiStory({ ...plan(p), factOrder: ['scope'] }, f, p));
  });
  process.env.ANTHROPIC_API_KEY = 'offline-api-key'; modelReply = plan();
  await test('model chooses a safe plan, and publisher generates the finished column', async () => { const output = await story.createTribuneStory(fixture); assert.equal(output.source, 'ai'); assert.equal(output.deck, facts.result); });
  await test('free-form model answer falls back to the factual story', async () => { modelReply = { ...plan(), inventedProse: 'A grand slam won it.' }; assert.deepEqual(await story.createTribuneStory(fixture), story.factualTribuneStory(fixture)); });
  await test('layout preview remains unchanged and never invokes the model', async () => { const calls = modelCalls; const preview = { ...fixture, preview: true }; assert.deepEqual(await story.createTribuneStory(preview), story.factualTribuneStory(preview)); assert.equal(modelCalls, calls); });
  await test('provider failure returns the factual column', async () => { modelError = true; assert.deepEqual(await story.createTribuneStory(fixture), story.factualTribuneStory(fixture)); modelError = false; });

  process.env.TRIBUNE_PREFERENCES_SECRET = 'offline-shared-secret';
  const id = '78bfcae0-9418-43e8-918d-fcceefb1d570', now = Date.now();
  const token = archive.createTribuneEditionToken(id, now);
  await test('edition token round-trips with a bounded one-year lifetime', () => { assert.equal(archive.verifyTribuneEditionToken(token, now), id); assert.equal(archive.verifyTribuneEditionToken(token, now + 367 * 86400000), null); });
  await test('edition signature tampering and extra segments rejected', () => { assert.equal(archive.verifyTribuneEditionToken(token.slice(0, -5) + 'abcde', now), null); assert.equal(archive.verifyTribuneEditionToken(token + '.extra', now), null); });
  await test('preference and edition tokens cannot substitute for each other', () => { const pref = preferences.createTribunePreferenceToken('pilot-uid', now); assert.equal(archive.verifyTribuneEditionToken(pref, now), null); assert.equal(preferences.verifyTribunePreferenceToken(token, now), null); });
  const publicUrl = 'https://1.yatstats.com/api/newsletter/edition?public=' + id;
  await test('public edition strips follows and all private setting/read tokens', () => {
    const publicCopy = archive.publicTribuneEdition(fixture, publicUrl), json = JSON.stringify(publicCopy);
    assert.equal(publicCopy.follows, undefined); assert.equal(publicCopy.recipientTier, 'fan');
    assert.equal(publicCopy.links.preferences, undefined); assert.equal(publicCopy.links.unsubscribe, undefined);
    assert.equal(publicCopy.links.web, publicUrl); assert.equal(publicCopy.links.text, publicUrl + '&format=text');
    for (const secret of ['Private Follow Name', 'Private Follow Choice', 'private-web-secret', 'private-text-secret', 'private-preferences-secret', 'private-unsubscribe-secret']) assert.equal(json.includes(secret), false);
  });
  await test('public redaction preserves school stats, column, matchup, sponsor and original private edition', () => {
    const publicCopy = archive.publicTribuneEdition(fixture, publicUrl);
    for (const key of ['homeRoster', 'story', 'matchup', 'sponsor']) assert.deepEqual(publicCopy[key], fixture[key]);
    assert.equal(fixture.recipientTier, 'superfan'); assert.ok(fixture.follows); assert.ok(fixture.links.preferences.includes('private-preferences-secret'));
  });
  let stored;
  queryImpl = async (sql, params) => {
    if (sql.startsWith('INSERT INTO public.alumni_newsletter_editions')) { stored = { id: params[0], uid: params[1], edition: JSON.parse(params[5]), publicEdition: JSON.parse(params[6]) }; return { rows: [], rowCount: 1 }; }
    return { rows: [{ value: sql.includes('SELECT public_edition') ? structuredClone(stored.publicEdition) : structuredClone(stored.edition) }] };
  };
  await test('archive stores the verified edition once and returns matching private/public links', async () => {
    const issue = await archive.storeTribuneEdition(fixture, 'pilot-uid');
    assert.equal(stored.uid, 'pilot-uid'); assert.deepEqual(stored.edition.homeRoster, fixture.homeRoster);
    assert.equal(archive.verifyTribuneEditionToken(new URL(issue.links.web).searchParams.get('token')), stored.id);
    assert.equal(new URL(issue.links.share).searchParams.get('public'), stored.id);
    assert.equal(stored.publicEdition.links.share, issue.links.share);
  });
  await test('public archive request selects only the public stored copy', async () => { const issue = await archive.readTribuneEdition({ publicId: stored.id }); assert.equal(issue.follows, undefined); assert.match(queries.at(-1)[0], /SELECT public_edition AS value/); });
  await test('private archive request retrieves the saved issue without regenerating stats or story', async () => { const privateToken = new URL(stored.edition.links.web).searchParams.get('token'); const issue = await archive.readTribuneEdition({ token: privateToken }); assert.deepEqual(issue, stored.edition); assert.match(queries.at(-1)[0], /SELECT edition AS value/); });
  await test('invalid or expired archive links never read the database', async () => {
    const before = queries.length;
    assert.equal(await archive.readTribuneEdition({ publicId: 'not-an-id' }), null);
    assert.equal(await archive.readTribuneEdition({ token: archive.createTribuneEditionToken(id, now - 400 * 86400000) }), null);
    assert.equal(queries.length, before);
  });
  await test('preview and unverified editions cannot enter the delivery archive', async () => {
    const before = queries.length;
    await assert.rejects(archive.storeTribuneEdition({ ...fixture, preview: true }, 'pilot-uid'));
    await assert.rejects(archive.storeTribuneEdition({ ...fixture, dataStatus: 'unavailable' }, 'pilot-uid'));
    assert.equal(queries.length, before);
  });
  console.log(`\n${passed} Tribune story/archive checks passed. Model and database calls were mocked.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
