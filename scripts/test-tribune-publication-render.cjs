/* Offline publication integration checks. No network, messages or database writes. */
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test loader injects mocked TypeScript dependencies. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function loader(overrides = {}) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(root, filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const req = (id) => {
      if (id in overrides) return overrides[id];
      if (id.startsWith('@/')) return load(path.join(root, 'src', id.slice(2)) + '.ts');
      if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id) + '.ts');
      return require(id);
    };
    new Function('require', 'module', 'exports', source)(req, mod, mod.exports);
    return mod.exports;
  }
  return load;
}

const load = loader();
const { renderTribuneHtml, renderTribuneText, tribuneSubject } = load('src/lib/tribune/render.ts');
const { TRIBUNE_LAYOUT_VERSION, TRIBUNE_NAME, TRIBUNE_TAGLINE, TRIBUNE_BYLINE } = load('src/lib/tribune/types.ts');
const roster = { title: 'Example School', playerCount: 1, batting: { kind: 'batting', rows: [], totals: [] }, pitching: { kind: 'pitching', rows: [], totals: [] } };
const legacy = {
  layoutVersion: TRIBUNE_LAYOUT_VERSION, preview: false, dataStatus: 'verified', generatedAt: '2027-02-08T11:00:00Z',
  school: { id: '1', name: 'Example School', location: 'Example City' }, recipientTier: 'fan',
  period: { cadence: 'weekly', start: '2027-02-01', end: '2027-02-07', label: 'February 1–7, 2027' },
  story: { headline: 'The alumni take the field', deck: 'The recorded weekly results.', paragraphs: ['A verified school report.'], source: 'facts' },
  homeRoster: roster,
  sponsor: { id: 'school-sponsor', name: 'Example Sponsor', headline: 'Hometown support.', body: 'The approved offer.', url: 'https://sponsor.example.invalid/offer', cta: 'Read the offer' },
  links: { hub: 'https://1.yatstats.com/', tournament: 'https://1.yatstats.com/#sec-fantasy', share: 'https://1.yatstats.com/#sec-fantasy' },
};
const publication = {
  masthead: { imageUrl: 'https://assets.example.invalid/masthead.png?v=2&size=wide', alt: 'The YAT-A-BOY Tribune — "Home & Away"', assetId: 'masthead-v2' },
  publisherNote: {
    id: 'note-week-1', revision: 2, title: 'Publisher’s Note & Community News',
    paragraphs: ['Welcome, <alumni> & friends.', 'This is the publisher’s own announcement.'],
    byline: 'The Publisher — Example School', imageUrl: 'https://assets.example.invalid/community.png',
    ctaLabel: 'Read the community announcement', ctaUrl: 'https://1.yatstats.com/community?week=1&view=all',
  },
  sponsor: {
    ...legacy.sponsor, creativeId: 'approved-creative-week-1', creativeVersion: 3,
    imageUrl: 'https://assets.example.invalid/sponsor-week-1.png', imageAlt: 'Baseball weekend offer — "Stay & Save"',
    acknowledgment: 'Example Sponsor makes this school’s free alumni coverage possible. Thank you for supporting our community.',
  },
  sweepstakesReminder: 'Registered fans have a chance to win a trip to the 2027 Fall Classic. Read this edition’s official rules for complete details.',
  officialRulesUrl: 'https://1.yatstats.com/official-rules-week-1', postalAddress: 'Publisher’s approved mailing address',
};
const edition = { ...structuredClone(legacy), ...structuredClone(publication) };
delete edition.officialRulesUrl; delete edition.postalAddress;
edition.links.officialRules = publication.officialRulesUrl;
edition.sender = { name: 'YAT?STATS', postalAddress: publication.postalAddress };
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS', name); }

async function main() {
  await test('older v1 snapshots retain the text masthead, exact tagline and sports byline', () => {
    const html = renderTribuneHtml(legacy), text = renderTribuneText(legacy);
    assert.ok(html.includes('class="masthead-sub"')); assert.ok(html.includes('class="tagline"'));
    assert.ok(text.includes(TRIBUNE_NAME.toUpperCase() + '\n' + TRIBUNE_TAGLINE));
    assert.ok(text.includes('By ' + TRIBUNE_BYLINE));
    assert.ok(html.includes('By YaTi | Ai Clubby &amp; All Around Cool Dude'));
    assert.equal(html.includes('FROM THE PUBLISHER'), false);
    assert.ok(text.includes('A tip of the cap to Example Sponsor.'));
    assert.ok(tribuneSubject(legacy).startsWith(TRIBUNE_NAME + ' | '));
  });
  await test('optional masthead image is responsive with escaped alternative text and live tagline', () => {
    const html = renderTribuneHtml(edition);
    assert.ok(html.includes('src="https://assets.example.invalid/masthead.png?v=2&amp;size=wide"'));
    assert.ok(html.includes('alt="The YAT-A-BOY Tribune — &quot;Home &amp; Away&quot;"'));
    assert.equal(html.includes('<span class="masthead-sub"'), false);
    assert.ok(html.includes('class="tagline"'));
  });
  await test('a tagline in the artwork suppresses only the duplicate visual tagline', () => {
    const issue = { ...edition, masthead: { ...edition.masthead, includesTagline: true } };
    assert.equal(renderTribuneHtml(issue).includes('class="tagline"'), false);
    assert.ok(renderTribuneText(issue).includes(TRIBUNE_NAME.toUpperCase() + '\n' + TRIBUNE_TAGLINE));
    const invalid = { ...issue, masthead: { ...issue.masthead, imageUrl: 'javascript:alert(1)' } };
    assert.ok(renderTribuneHtml(invalid).includes('class="tagline"'));
    assert.ok(renderTribuneHtml(invalid).includes('<span class="masthead-sub"'));
  });
  await test('Publisher’s Note is separate from the sports story in both formats', () => {
    const html = renderTribuneHtml(edition), text = renderTribuneText(edition);
    assert.ok(html.includes('Welcome, &lt;alumni&gt; &amp; friends.'));
    assert.ok(html.indexOf('FROM THE PUBLISHER') < html.indexOf('<h2 class="headline"'));
    assert.ok(text.indexOf('FROM THE PUBLISHER') < text.indexOf(edition.story.headline));
    for (const value of [...edition.publisherNote.paragraphs, edition.publisherNote.byline, edition.publisherNote.title]) assert.ok(text.includes(value));
    assert.ok(html.includes('href="https://1.yatstats.com/community?week=1&amp;view=all"'));
    assert.ok(html.includes('alt="Publisher’s Note &amp; Community News"'));
    assert.ok(text.includes('Read the community announcement: ' + edition.publisherNote.ctaUrl));
    assert.ok(text.includes('Publisher’s Note image: ' + edition.publisherNote.imageUrl));
    assert.equal(text.split('By ' + TRIBUNE_BYLINE).length - 1, 1);
  });
  await test('editable text cannot create HTML markup or attribute handlers', () => {
    const unsafe = {
      ...edition,
      publisherNote: { ...edition.publisherNote, title: '<script>alert(1)</script>', paragraphs: ['<img src=x onerror="alert(1)">'], byline: '<b>Publisher</b>', ctaLabel: '<svg onload="alert(1)">' },
      sponsor: { ...edition.sponsor, imageAlt: '" onerror="alert(1)', acknowledgment: '<script>alert(2)</script>' },
    };
    const html = renderTribuneHtml(unsafe);
    assert.equal(html.includes('<script>'), false); assert.equal(html.includes('<img src=x'), false);
    assert.equal(html.includes(' onerror="alert'), false); assert.equal(html.includes('<svg'), false);
    assert.ok(html.includes('&lt;script&gt;alert(2)&lt;/script&gt;'));
    assert.ok(renderTribuneText(unsafe).includes('<script>alert(2)</script>'));
  });
  await test('unsafe and relative URLs never become links or images', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', '/relative/path', '//example.invalid/asset']) {
      const issue = { ...edition, masthead: { imageUrl: bad, alt: 'Unavailable image' },
        publisherNote: { ...edition.publisherNote, imageUrl: bad, ctaUrl: bad },
        sponsor: { ...edition.sponsor, imageUrl: bad, logoUrl: bad, url: bad } };
      const html = renderTribuneHtml(issue), text = renderTribuneText(issue);
      assert.equal(html.includes('src="' + bad), false); assert.equal(html.includes('href="' + bad), false);
      assert.equal(text.includes(bad), false);
    }
  });
  await test('one sponsor snapshot supplies the ad and acknowledgment in HTML and text', () => {
    const html = renderTribuneHtml(edition), text = renderTribuneText(edition);
    for (const value of [edition.sponsor.headline, edition.sponsor.body, edition.sponsor.acknowledgment]) {
      assert.ok(html.includes(value)); assert.ok(text.includes(value));
    }
    assert.ok(html.includes('alt="Baseball weekend offer — &quot;Stay &amp; Save&quot;"'));
    assert.equal(text.includes('A tip of the cap to'), false);
    assert.equal(html.includes(edition.sponsor.creativeId), false);
    assert.equal(text.includes(edition.sponsor.creativeId), false);
  });
  await test('dated sweepstakes copy and rules are shared by both formats with legacy fallback', () => {
    for (const output of [renderTribuneHtml(edition), renderTribuneText(edition)]) {
      assert.ok(output.includes(edition.sweepstakesReminder)); assert.ok(output.includes(edition.links.officialRules));
    }
    assert.ok(renderTribuneText(legacy).includes('Your school’s fantasy bracket is also a fan sweepstakes'));
  });

  let resolved = structuredClone(publication), resolverCalls = [], storyInputs = [];
  const build = loader({
    '@/lib/db': { query: async () => ({ rows: [{ hsname: 'Example School', hslocation: 'Example City', microsite_url: 'https://1.yatstats.com/' }] }) },
    '@/app/api/players/[hsid]/route': { GET: async () => new Response(JSON.stringify([{ playerid: 'player-1' }]), { status: 200 }) },
    '@/lib/partners/publication': { resolveTribunePublication: async (input) => { resolverCalls.push(input); return resolved; } },
    '@/lib/schoolAssets': { getSchoolCrestUrl: () => 'https://assets.example.invalid/school.png' },
    './preferences': { tribunePreferenceLinks: () => ({ preferences: 'https://1.yatstats.com/preferences', unsubscribe: 'https://1.yatstats.com/unsubscribe' }) },
    './tournament': { loadTribuneData: async () => ({ homeRoster: roster, dataStatus: 'verified', notices: [], statLineCount: 4 }) },
    './story': { createTribuneStory: async (input) => { storyInputs.push(input); return legacy.story; } },
  })('src/lib/tribune/build.ts');
  const buildInput = { request: {}, fan: { firebase_uid: 'example-fan', home_hsid: '1', plan: 'fan' }, period: legacy.period, preview: true };
  const oldRules = process.env.TRIBUNE_OFFICIAL_RULES_URL, oldAddress = process.env.TRIBUNE_POSTAL_ADDRESS;
  process.env.TRIBUNE_OFFICIAL_RULES_URL = 'https://fallback.example.invalid/rules';
  process.env.TRIBUNE_POSTAL_ADDRESS = 'Fallback mailing address';
  try {
    await test('builder resolves once for school and reporting window, before constructing the story', async () => {
      const result = await build.buildTribuneEdition(buildInput);
      assert.equal(result.statLineCount, 4); assert.equal(resolverCalls.length, 1); assert.equal(storyInputs.length, 1);
      assert.deepEqual({ ...resolverCalls[0], asOf: undefined }, { hsid: '1', cadence: 'weekly', periodStart: '2027-02-01', periodEnd: '2027-02-07', asOf: undefined });
      assert.equal(resolverCalls[0].asOf.toISOString(), result.edition.generatedAt);
      for (const key of ['masthead', 'publisherNote', 'sponsor', 'sweepstakesReminder']) assert.deepEqual(result.edition[key], publication[key]);
      assert.deepEqual(storyInputs[0].sponsor, result.edition.sponsor);
      assert.equal(result.edition.links.officialRules, publication.officialRulesUrl);
      assert.equal(result.edition.sender.postalAddress, publication.postalAddress);
      resolved.sponsor.headline = 'A later draft'; resolved.publisherNote.paragraphs[0] = 'A later note';
      assert.equal(result.edition.sponsor.headline, publication.sponsor.headline);
      assert.equal(result.edition.publisherNote.paragraphs[0], publication.publisherNote.paragraphs[0]);
    });
    await test('missing publication fields preserve env fallbacks and a reserved sponsor space', async () => {
      resolved = {};
      const { edition: issue } = await build.buildTribuneEdition(buildInput);
      assert.equal(issue.sponsor, undefined); assert.equal(issue.masthead, undefined); assert.equal(issue.publisherNote, undefined);
      assert.equal(issue.links.officialRules, process.env.TRIBUNE_OFFICIAL_RULES_URL);
      assert.equal(issue.sender.postalAddress, process.env.TRIBUNE_POSTAL_ADDRESS);
      assert.ok(renderTribuneText(issue).includes('ADVERTISEMENT — SPONSOR SPACE'));
    });
  } finally {
    if (oldRules === undefined) delete process.env.TRIBUNE_OFFICIAL_RULES_URL; else process.env.TRIBUNE_OFFICIAL_RULES_URL = oldRules;
    if (oldAddress === undefined) delete process.env.TRIBUNE_POSTAL_ADDRESS; else process.env.TRIBUNE_POSTAL_ADDRESS = oldAddress;
  }

  let stored, writes = 0;
  const archive = loader({ '@/lib/tribune/db': { query: async (sql, params) => {
    if (sql.startsWith('INSERT INTO')) {
      writes++; stored = { edition: JSON.parse(params[5]), publicEdition: JSON.parse(params[6]) }; return { rows: [] };
    }
    return { rows: [{ value: structuredClone(sql.includes('SELECT public_edition') ? stored.publicEdition : stored.edition) }] };
  } } })('src/lib/tribune/archive.ts');
  const oldSecret = process.env.TRIBUNE_PREFERENCES_SECRET;
  process.env.TRIBUNE_PREFERENCES_SECRET = 'offline-publication-archive-secret';
  try {
    await test('archive preserves publication revision and sponsor creative in both immutable copies', async () => {
      const original = structuredClone(edition);
      const prepared = await archive.storeTribuneEdition(original, 'example-fan');
      assert.equal(writes, 1);
      for (const key of ['masthead', 'publisherNote', 'sponsor', 'sweepstakesReminder']) {
        assert.deepEqual(stored.edition[key], edition[key]); assert.deepEqual(stored.publicEdition[key], edition[key]);
      }
      original.sponsor.headline = 'New campaign'; original.publisherNote.paragraphs[0] = 'New publisher note'; original.masthead.imageUrl = 'https://example.invalid/new.png';
      assert.deepEqual(prepared.sponsor, edition.sponsor); assert.deepEqual(prepared.publisherNote, edition.publisherNote); assert.deepEqual(prepared.masthead, edition.masthead);
      const token = new URL(prepared.links.web).searchParams.get('token');
      const reopened = await archive.readTribuneEdition({ token });
      assert.deepEqual(reopened, stored.edition);
      assert.equal(reopened.sponsor.creativeVersion, 3); assert.equal(reopened.publisherNote.revision, 2);
      assert.equal(writes, 1);
      assert.ok(renderTribuneHtml(reopened).includes('Hometown support.'));
      assert.ok(renderTribuneText(reopened).includes('Welcome, <alumni> & friends.'));
    });
  } finally {
    if (oldSecret === undefined) delete process.env.TRIBUNE_PREFERENCES_SECRET; else process.env.TRIBUNE_PREFERENCES_SECRET = oldSecret;
  }
  console.log(`\n${passed} Tribune publication/render checks passed. All data sources and archive writes were mocked.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
