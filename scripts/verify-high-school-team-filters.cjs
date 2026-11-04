// Guard the real current-team filter and card components against decorative
// "SCHOOL COMMIT" badges being mistaken for canonical status values.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

function loadHelpers(file, names, context = {}) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const selected = ast.statements.filter(s =>
    ts.isFunctionDeclaration(s) && names.includes(s.name?.text) ||
    ts.isVariableStatement(s) && s.declarationList.declarations.some(d => names.includes(d.name.getText(ast)))
  );
  const source = selected.map(s => s.getText(ast)).join('\n') + '\nexport { ' + names.join(',') + ' };';
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { ...context, exports, Set, Map, Array, Number, String, RegExp, console }, { filename: file });
  for (const name of names) assert.ok(exports[name], 'Missing source helper ' + name);
  return exports;
}

// Current-team membership is OR (HIGH SCHOOL level, COMMIT, UNCOMMITTED),
// not the Active Alumni preset or the presence of 2026 statistics.
const page = loadHelpers('src/app/[hsid]/page.tsx', ['isHighSchoolPlayer']);
assert.equal(page.isHighSchoolPlayer({ status_label: 'COMMIT', level_label: null }), true);
assert.equal(page.isHighSchoolPlayer({ status_label: 'UNCOMMITTED', level_label: null }), true);
assert.equal(page.isHighSchoolPlayer({ status_label: 'UNKNOWN', level_label: 'HIGH SCHOOL' }), true);
assert.equal(page.isHighSchoolPlayer({ status_label: 'ACTIVE', level_label: 'NCAA-D1' }), false);

// Mount the real server-side card function with child components stubbed.
// This verifies the actual article attributes, not a copy of the mapping.
const cardImports = {
  'react/jsx-runtime': require('react/jsx-runtime'),
  '@/lib/playerUtils': { gradClassInfo:()=>({ estimated:false }), varsityDots:()=>[], normalizeOrg:v=>v||'' },
  '@/lib/playerDisplay': { resolvePlayerDisplay:p=>({
    statusLabel:p.display_status_label || p.status_label || 'UNKNOWN',
    levelLabel:p.display_level_label || p.level_label || '',
    teamName:p.current_team_name || '', orgConferenceName:p.current_org_or_conference_name || '',
    isSourcedDeparture:false, isTransactionDeparture:false
  }) },
  '@/lib/galleryStatuses': { normalizeGalleryStatus: v => String(v || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN' },
  '@/lib/playerImage': {
    getPlayerNowThumbUrl:()=>'/now.jpg', getPlayerThenCardUrl:()=>'/then.jpg',
    getTeamLogoUrl:id=>'/team/'+id+'.png', getThenSilhouetteUrl:()=>'/fallback.jpg'
  },
  '@/lib/schoolAssets': { getSchoolCrestUrl:()=>'/crest.png', CREST_FALLBACK_PATH:'/crest.png' },
  '@/lib/slug': { toPlayerSlug:()=> 'test-player' },
  '@/components/yatstats/PlayerCardFront': { default:()=>null },
  '@/components/yatstats/PlayerCardBack': { default:()=>null },
  '@/components/yatstats/PlayerCardFlipBehavior': { default:()=>null },
};
const compiledCard = ts.transpileModule(read('src/components/yatstats/PlayerCard.tsx'), {
  compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2021, jsx:ts.JsxEmit.ReactJSX, esModuleInterop:true },
}).outputText;
const cardModule = { exports:{} };
vm.runInNewContext(compiledCard, {
  exports: cardModule.exports, module:cardModule, require:name=>{
    assert.ok(cardImports[name], 'Unstubbed card dependency: '+name);
    return cardImports[name];
  }, React, Array, Object, String, Boolean, Number, JSON, console
}, { filename:'PlayerCard.tsx' });
const PlayerCard = cardModule.exports.default;
assert.equal(typeof PlayerCard, 'function');
for (const [id, displayStatus] of [
  ['YAT000083', 'OKLAHOMA STATE COMMIT'],
  ['YAT000086', 'TEXAS A&M COMMIT'],
]) {
  const element = PlayerCard({ player: {
    playerid:id, first_name:'Test', last_name:'Player',
    class_of:'2027', roster_years:['2027'],
    status_label:'COMMIT', display_status_label:displayStatus,
    level_label:'HIGH SCHOOL', display_level_label:'HIGH SCHOOL'
  }, resolvedHsid:'1729' });
  assert.equal(element.props['data-status'], 'COMMIT', 'Canonical status must survive descriptive badge: '+id);
  assert.equal(element.props['data-level'], 'HIGH SCHOOL');
}
const uncommittedCard = PlayerCard({ player:{
  playerid:'YAT999999',status_label:'UNCOMMITTED',display_status_label:'UNCOMMITTED',
  level_label:'HIGH SCHOOL',roster_years:['2027']
}, resolvedHsid:'1729' });
assert.equal(uncommittedCard.props['data-status'], 'UNCOMMITTED');

// Use the actual GalleryFilterController functions and a minimal real-shaped
// checkbox DOM: Select All on, Select All off, and COMMIT-only must behave.
const groups = new Map();
const section = { id:'sec-current', dataset:{}, cards:[],
  querySelectorAll(){return this.cards;}, querySelector(){return null;} };
const inputs = [];
const document = {
  getElementById:id=> id===section.id ? section : groups.get(id)||null,
  querySelectorAll:selector=>selector==='#filters input'?inputs:[]
};
for (const [id, values] of [
  ['filterStatus',['COMMIT','UNCOMMITTED','ACTIVE','UNKNOWN']],
  ['filterLevels',['HIGH SCHOOL','NCAA-D1']],
  ['filterOrgs',[]],['filterGradClass',[]],['filterRosterYears',[]]
]) {
  const boxes = values.map(value=>({ value, checked:false, type:'checkbox', indeterminate:false }));
  const selectAll = {checked:false,indeterminate:false,type:'checkbox',dataset:{selectAll:''}};
  inputs.push(selectAll,...boxes);
  groups.set(id,{
    boxes, selectAll,
    querySelectorAll:selector=>selector.includes(':not([data-select-all])')?boxes:boxes,
    querySelector:selector=>selector.includes('[data-select-all]')?selectAll:null
  });
}
const makeCard = (id,status,level) => {
  const wrapper = {style:{display:''}};
  const card = {dataset:{playerid:id,name:id,status,level,org:'',gradclass:'2027',rosteryears:'2027'},
    closest:selector=>selector==='[data-player-card-wrap="true"]'?wrapper:null};
  section.cards.push(card);
  return wrapper;
};
const ben = makeCard('YAT000083','COMMIT','HIGH SCHOOL');
const striker = makeCard('YAT000086','COMMIT','HIGH SCHOOL');
const unknownLevel = makeCard('YAT000100','UNCOMMITTED','');
const filter = loadHelpers('src/components/yatstats/GalleryFilterController.tsx', [
  'PLAYER_GALLERY_SECTIONS','FILTERABLE_SECTIONS','normalize','getGroupBoxes','getSelectedValues',
  'syncSelectAll','syncEverySelectAll','clearFilters','setAll','setValues',
  'getFavoritesGalleryRestriction','matchesGraduatingClass','applyFilters','applyPreset'
], {
  document, window:{location:{search:''},dispatchEvent:()=>{}},
  CustomEvent: class {constructor(type,detail){this.type=type;this.detail=detail.detail;}},
  ACTIVE_GALLERY_STATUSES:['ACTIVE']
});
filter.applyPreset('current');
assert.equal(ben.style.display, '');
assert.equal(striker.style.display, '');
assert.equal(unknownLevel.style.display, '');
assert.equal(groups.get('filterLevels').boxes.some(box=>box.checked), false,
  'Current team must not silently impose a level-only filter');
assert.ok(groups.get('filterStatus').boxes.every(box=>box.checked),
  'Current team default Select All should check all statuses');
groups.get('filterStatus').boxes.forEach(box=>{box.checked=false;});
filter.applyFilters('current');
assert.equal(ben.style.display, '');
assert.equal(striker.style.display, '');
groups.get('filterStatus').boxes.forEach(box=>{box.checked=box.value==='COMMIT';});
filter.applyFilters('current');
assert.equal(ben.style.display, '');
assert.equal(striker.style.display, '');
assert.equal(unknownLevel.style.display, 'none');
console.log('PASS: Santiago 2027 cards, high-school roster membership, Select All and COMMIT-only filters');
