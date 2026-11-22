// Exercise the real query builders and NewsPanel request lifecycle. No live
// services, database credentials or fabricated production records are used.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
process.env.TZ = 'America/Phoenix';

function functionsFrom(file, names) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const declarations = tree.statements.filter(node =>
    ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(declarations.length, names.length, 'All tested functions must exist');
  return declarations.map(node => node.getText(tree)).join('\n');
}
function compile(source, context, name) {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, { ...context, exports, module: { exports } }, { filename: name });
  return exports;
}
function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!node || typeof node !== 'object') return [];
  return [node, ...flatten(node.children)];
}
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (node == null || node === false) return '';
  if (typeof node === 'object') return textOf(node.children);
  return String(node);
}

(async () => {
  const captured = [];
  const queryNames = ['acceptedFanNews', 'syndicatedCopyFilter', 'getNewsByHsid', 'getNewsByPlayer'];
  const readers = compile(functionsFrom('src/lib/db.ts', queryNames), {
    console, query: async (sql, params) => { captured.push({ sql, params }); return { rows: [] }; },
  }, 'news-readers.js');
  await readers.getNewsByHsid('12546', 100, 100);
  const school = captured.pop();
  assert.match(school.sql, /SELECT yatid FROM public\.yat_school_links WHERE hsid::text = \$1/,
    'Every school chapter must receive a person\'s transaction news');
  assert.match(school.sql, /JOIN school_people school_person ON school_person\.yatid = na_person\.yatid/);
  assert.match(school.sql, /ON f\.yatid = COALESCE/,
    'Secondary schools must resolve the card metadata by YAT identity');
  assert.match(school.sql, /COALESCE\(f\.playerid::text, na\.yatid\) AS associated_playerid/,
    'School headshot filters retain their existing card presentation IDs');
  assert.deepEqual(Array.from(school.params), ['12546', 100, 100], 'School history remains paginated');

  await readers.getNewsByPlayer('YAT100750', null, true);
  const profile = captured.pop();
  assert.doesNotMatch(profile.sql, /\bLIMIT\b/, 'Full player news must not truncate transaction history');
  assert.match(profile.sql, /na0\.yatid = p\.yatid/, 'Player history resolves by canonical person');
  assert.match(profile.sql, /ON f\.yatid = \(SELECT yatid FROM person\)/,
    'YAT-ID profile URLs receive the same metadata as legacy addresses');
  assert.deepEqual(Array.from(profile.params), ['YAT100750', true]);
  await readers.getNewsByPlayer('YAT100750', 3, false, false);
  const card = captured.pop();
  assert.match(card.sql, /ORDER BY\s+na\.published_at DESC NULLS LAST, na\.id DESC\s+LIMIT \$2/,
    'Flip card returns the three newest events with a stable tie breaker');
  assert.deepEqual(Array.from(card.params), ['YAT100750', 3, false]);
  for (const { sql } of [school, profile, card]) {
    assert.match(sql, /discovery_source = 'mlb_transactions'[\s\S]*?verification_status = 'VERIFIED'[\s\S]*?uuid LIKE 'mlb-transaction:%'\) OR NOT EXISTS/,
      'Distinct verified transaction IDs must survive identical headlines');
    assert.match(sql, /dup\.yatid = na\.yatid/, 'Editorial dedupe compares people by YAT ID');
    assert.match(sql, /na\.verification_status = 'VERIFIED'/, 'Public verification gate remains required');
    assert.match(sql, /rejected\.approval_status = 'rejected'/, 'Existing moderation policy remains intact');
  }
  if (process.argv.includes('--print-sql')) {
    console.log(JSON.stringify({ school, profile, card }));
    return;
  }

  // A minimal hook runner lets the actual component execute its effects,
  // cleanup and state changes without depending on React's DOM renderer.
  const hooks = [], effects = [], requests = [];
  let cursor = 0, pendingEffects = [], props;
  const context = {
    console, Date, AbortController,
    React: { createElement: (type, attrs, ...children) => ({ type, props: attrs || {}, children }) },
    useState(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = initial;
      return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = { current: initial };
      return hooks[i];
    },
    useEffect(effect, deps) {
      const i = cursor++;
      const previous = effects[i];
      if (!previous || deps.some((value, j) => !Object.is(value, previous.deps[j]))) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          effects[i] = { deps, cleanup: effect() };
        });
      }
    },
    fetch: (url, options) => new Promise(resolve => { requests.push({ url, options, resolve }); }),
    parseNewsVideo: () => null,
    PLAYER_SILHOUETTE_URL: '/silhouette.png',
  };
  const component = compile(functionsFrom('src/components/yatstats/FunZone.tsx', ['NewsPanel']) +
    '\nexports.NewsPanel = NewsPanel;', context, 'news-panel.js').NewsPanel;
  function render(nextProps = props) {
    props = nextProps; cursor = 0; pendingEffects = [];
    const output = component(props);
    const run = pendingEffects; pendingEffects = [];
    run.forEach(effect => effect());
    return output;
  }
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const player = { playerid: '209810', yatid: 'YAT100750', slug: 'royce-lewis', first_name: 'Royce' };
  const inactive = { player, resolvedHsid: '12546', isActive: false };
  render(inactive);
  assert.equal(requests.length, 0, 'News must remain lazy on unopened cards');
  render({ ...inactive, isActive: true });
  assert.match(requests[0].url, /player=YAT100750&limit=3&sort=newest$/,
    'Card request uses canonical YAT identity and newest-three ordering');
  render(inactive);
  assert.equal(requests[0].options.signal.aborted, true, 'Closing the tab cancels its in-flight request');
  render({ ...inactive, isActive: true });
  assert.equal(requests.length, 2, 'Reopening after cancellation must retry rather than remain empty');
  const posts = [4, 3, 2, 1].map(id => ({ uuid: `mlb-transaction:${id}`, title: `Event ${id}`,
    displayHeadline: `Event ${id}`, displaySourceLabel: 'MLB Transactions',
    publishedAt: '2026-06-15T00:00:00.000Z' }));
  requests[0].resolve({ ok: true, json: async () => ({ posts: [{ title: 'Stale event' }] }) });
  requests[1].resolve({ ok: true, json: async () => ({ posts }) });
  await settle();
  let output = render();
  const cards = flatten(output).filter(node => node.type === 'article');
  assert.equal(cards.length, 3, 'Only three real news cards appear');
  assert(textOf(cards[0]).includes('Event 4') && textOf(cards[2]).includes('Event 2'));
  assert(!textOf(output).includes('Stale event'), 'Cancelled responses never replace current news');
  assert(textOf(output).includes('6/15/2026'), 'Transaction calendar dates retain the source UTC day');
  const links = flatten(cards).filter(node => node.type === 'a').map(node => node.props.href);
  assert(links.every(link => /\/player\/YAT100750\/royce-lewis\?story=mlb-transaction%3A[234]#ppTab-news$/.test(link)),
    'Each card opens its own news story on the correct player profile');

  const nextPlayer = { ...player, yatid: 'YAT117488', playerid: '331234', slug: 'ronan-kopp' };
  output = render({ ...props, player: nextPlayer });
  assert(!textOf(output).includes('Event 4'), 'Changing the player cannot momentarily display another person\'s news');
  requests[2].resolve({ ok: true, json: async () => ({ posts: [{ uuid: 'mlb-transaction:5', title: 'Next player event' }] }) });
  await settle();
  output = render();
  assert(textOf(output).includes('Next player event'));
  render({ ...props, isActive: false });
  render({ ...props, isActive: true });
  assert.equal(requests.length, 4, 'A new visit checks for newly published transactions');
  console.log('PASS: transaction news across school/player readers, distinct events, newest three, dates, story links, and cancelled/reused cards');
})().catch(error => { console.error(error); process.exitCode = 1; });
