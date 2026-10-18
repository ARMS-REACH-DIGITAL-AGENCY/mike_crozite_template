// Run with: node scripts/test-gallery-membership.cjs
// Exercise the actual DOM-reading/filter helpers and layout's actual level choices.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone fixture harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Extract declarations using the TypeScript AST, so tests execute the source
// helpers rather than copying their behavior or mounting unrelated React code.
function helpers(file, names, context) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const selected = source.statements.filter(statement => {
    if (ts.isFunctionDeclaration(statement)) return names.includes(statement.name?.text);
    if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.some(d => names.includes(d.name.getText(source)));
    return false;
  });
  const text = selected.map(statement => statement.getText(source)).join('\n') + '\nexport { ' + names.join(',') + ' };';
  const compiled = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { ...context, exports }, { filename: file });
  for (const name of names) assert.ok(exports[name], `Actual source helper ${name} must exist`);
  return exports;
}

let section;
const groups = new Map();
const document = {
  querySelectorAll: selector => selector === '.yat-section.visible' ? [section] : [],
  getElementById: id => id === section.id ? section : groups.get(id) || null,
};
const context = { document, window: { location: { hash: '#sec-active' }, dispatchEvent() {} },
  CustomEvent: class { constructor(type, value) { this.type = type; this.detail = value.detail; } },
  HEADSHOT_FALLBACK_SRC: '/img/headshot-silhouette.png',
};
const row3 = helpers('src/components/yatstats/Row3MirrorGuard.tsx', ['getVisibleSectionKey', 'isCardVisible'], context);
const strip = helpers('src/components/yatstats/shell/InteractionStrip.tsx', [
  'YAT_ASSETS_BASE', 'PLAYER_NOW_BASE', 'PLAYER_THEN_BASE', 'UNCOMMITTED_BADGE_SRC',
  'PLAYER_GALLERY_SECTIONS', 'cleanSrc', 'normalizeStatus', 'isCardVisible', 'readPlayersFromVisibleBlockFive',
], context);
const filter = helpers('src/components/yatstats/GalleryFilterController.tsx', [
  'PLAYER_GALLERY_SECTIONS', 'LEVEL_ORDER', 'getFavoritesGalleryRestriction', 'normalize', 'getGroupBoxes',
  'getSelectedValues', 'matchesGraduatingClass', 'sortFilteredAllTime', 'applyFilters',
], context);

function fixture(key) {
  section = { id: 'sec-' + key, dataset: {}, cards: [], querySelectorAll() { return this.cards; }, querySelector() { return null; } };
  function card(id, current, extra = {}) {
    const wrapper = { style: { display: '' }, hidden: false };
    const item = { dataset: { playerid: id, name: id, ...(current === undefined ? {} : { has2026Stats: String(current) }), ...extra },
      hidden: false, style: { display: '' },
      closest(selector) { return selector === '.yat-section' ? section : wrapper; }, wrapper,
    };
    section.cards.push(item);
    return item;
  }
  return card;
}
const ids = values => Array.from(values, item => item.id || item.dataset.playerid);
const readStrip = key => ids(strip.readPlayersFromVisibleBlockFive(key, new Map()));
const readGuard = () => ids(section.cards.filter(row3.isCardVisible));

let card = fixture('active');
card('current', true);
card('retired-in-2026', true, { status: 'RETIRED' });
card('historical', false, { status: 'RETIRED', superfanSynthetic: 'true' });
card('loading-favorite', undefined, { superfanSynthetic: 'true' });
assert.deepEqual(readStrip('active'), ['current', 'retired-in-2026']);
assert.deepEqual(readGuard(), ['current', 'retired-in-2026']);

section.dataset.favoritesGalleryActive = 'true';
section.dataset.favoritesGalleryIds = 'historical,loading-favorite';
filter.applyFilters('active');
assert.deepEqual(readStrip('active'), ['historical', 'loading-favorite']);
assert.deepEqual(readGuard(), ['historical', 'loading-favorite']);
section.cards[2].wrapper.hidden = true;
assert.deepEqual(readStrip('active'), ['loading-favorite']);
assert.deepEqual(readGuard(), ['loading-favorite']);
delete section.dataset.favoritesGalleryActive;
assert.deepEqual(readStrip('active'), []);
assert.deepEqual(readGuard(), []);
console.log('PASS: Normal Active, in-season retirement, explicit Favorites, hidden cards, and leaving Favorites agree in both portrait readers');

card = fixture('alltime');
const generic = card('college-generic', false, { level: 'NCAA' });
const division = card('college-division-one', false, { level: 'NCAA-D1' });
const layout = ts.createSourceFile('layout.tsx', read('src/app/[hsid]/layout.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let choices;
function visit(node) {
  if (ts.isArrayLiteralExpression(node)) {
    const values = Array.from(node.elements).filter(ts.isStringLiteral).map(value => value.text);
    if (values.includes('NCAA-D1') && values.includes('HIGH SCHOOL')) choices = values;
  }
  ts.forEachChild(node, visit);
}
visit(layout);
assert.ok(choices?.includes('NCAA'), 'The actual By Level choices must include generic NCAA');
const boxes = choices.map(value => ({ value, checked: true }));
groups.set('filterLevels', { querySelectorAll() { return boxes; } });
filter.applyFilters('alltime');
assert.equal(generic.wrapper.style.display, '');
assert.equal(division.wrapper.style.display, '');
assert.deepEqual(readStrip('alltime'), ['college-generic', 'college-division-one']);
for (const box of boxes) box.checked = box.value === 'NCAA';
filter.applyFilters('alltime');
assert.equal(generic.wrapper.style.display, '');
assert.equal(division.wrapper.style.display, 'none');
assert.deepEqual(readStrip('alltime'), ['college-generic']);
const utilities = helpers('src/lib/playerUtils.ts', ['LEVEL_RANK', 'levelLabel'], context);
const universe = helpers('src/components/yatstats/GalleryUniverseController.tsx', ['rank'], context);
assert.equal(utilities.levelLabel('NCAA'), 'NCAA');
assert.equal(filter.LEVEL_ORDER.NCAA, utilities.LEVEL_RANK.NCAA);
assert.equal(filter.LEVEL_ORDER.NCAA, universe.rank.NCAA);
assert.ok(filter.LEVEL_ORDER.NCAA > filter.LEVEL_ORDER["INT'L"] && filter.LEVEL_ORDER.NCAA < filter.LEVEL_ORDER.NAIA);
console.log('PASS: The actual Select All and NCAA-only level options preserve generic college cards and All-Time portrait membership');
