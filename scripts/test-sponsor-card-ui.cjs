/* eslint-disable @typescript-eslint/no-require-imports -- Offline TypeScript/React contract harness. */
// No database, network, email, or persisted sponsor data is used by this test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const frontPath = 'src/components/yatstats/PlayerCardFront.tsx';
const baseCard = {
  id:'12', sponsorId:'34', sponsorName:'Sample Community Partner', sponsorLogoUrl:'https://assets.example.test/logo.png', revision:1,
  firstName:'Jamie', lastName:'Example', currentTeam:'Hometown Business', organization:'Community Partners', level:'SPONSOR',
  statusLabel:'RETIRED', gradClass:'1996', varsityYears:['1994','1995','1996'],
  frontImageUrl:'https://assets.example.test/front.jpg', frontImageAlt:'Sample sponsor portrait',
  backTemplate:'banner_text', bannerImageUrl:'https://assets.example.test/banner.png', bannerImageAlt:'Sample partner banner',
  fullImageUrl:'https://assets.example.test/art.png', fullImageAlt:'Full sample artwork',
  headline:'Hometown pride', body:'A sample message for our alumni community.', ctaLabel:'Visit our partner', ctaUrl:'https://partner.example.test/',
  schoolIds:['5004'], hsid:'5004', schoolName:'Example School', schoolColor1:'#8a1538', schoolColor2:'#777777',
};
const empty = { __esModule:true, default: () => null };

function createLoader({ overrides = {}, globals = {}, sources = {} } = {}) {
  const cache = new Map();
  function load(file) {
    if (Object.hasOwn(overrides, file)) return overrides[file];
    if (cache.has(file)) return cache.get(file);
    const filename = path.join(root, file);
    const exported = {};
    cache.set(file, exported);
    const source = sources[file] ?? fs.readFileSync(filename, 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: {
      module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2021, jsx:ts.JsxEmit.ReactJSX, esModuleInterop:true,
    } }).outputText;
    vm.runInNewContext(code, {
      exports:exported, console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
      ...globals,
      require(name) {
        if (Object.hasOwn(overrides, name)) return overrides[name];
        if (name.startsWith('@/') || name.startsWith('.')) {
          const base = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(filename), name);
          const found = ['.ts','.tsx'].map(ext => base + ext).find(fs.existsSync);
          if (!found) throw new Error(`Missing test dependency ${name}`);
          return load(path.relative(root, found));
        }
        return require(name);
      },
    }, { filename });
    return exported;
  }
  return load;
}

const normalLoad = createLoader({ overrides:{
  'src/components/yatstats/CardPhoto.tsx':empty,
  'src/components/yatstats/FavoriteButton.tsx':empty,
} });
const { readSponsorCard, sponsorCardCopy } = normalLoad('src/lib/partners/sponsorCardPresentation.ts');
const markup = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

test('public projection accepts only sponsor fields and rejects unsafe URLs and data types', () => {
  const safe = readSponsorCard({ ...baseCard, playerid:'should-never-survive', hr:99, html:'<script>unsafe()</script>', style:{ color:'red' } });
  assert.equal(safe.level, 'SPONSOR');
  for (const key of ['playerid','hr','html','style']) assert.equal(Object.hasOwn(safe, key), false);
  for (const key of ['frontImageUrl','bannerImageUrl','fullImageUrl','sponsorLogoUrl','ctaUrl']) {
    for (const unsafe of ['javascript:alert(1)','data:text/html,test','http://example.test/image','https://user:secret@example.test/image']) {
      assert.equal(readSponsorCard({ ...baseCard, [key]:unsafe }), null, `${key}: ${unsafe}`);
    }
  }
  assert.equal(readSponsorCard({ ...baseCard, level:'MLB' }), null);
  assert.equal(readSponsorCard({ ...baseCard, schoolColor1:'red;position:fixed' }), null);
  assert.equal(readSponsorCard({ ...baseCard, body:'x'.repeat(1801) }), null);
  assert.equal(readSponsorCard({ ...baseCard, revision:0 }), null);
});

test('sponsor front reuses the exact frame with all contribution fields and no player actions', () => {
  const forbidden = () => { throw new Error('Sponsor invoked player-only presentation'); };
  const load = createLoader({ overrides:{
    '@/lib/playerImage':{ getThenSilhouetteUrl:forbidden, getPlayerThenCardUrl:forbidden, getPlayerThenImageUrl:forbidden },
    '@/lib/playerDisplay':{ resolvePlayerDisplay:forbidden },
    'src/components/yatstats/CardPhoto.tsx':{ __esModule:true, default:forbidden },
    'src/components/yatstats/FavoriteButton.tsx':{ __esModule:true, default:forbidden },
  } });
  const front = markup(load(frontPath).default, { sponsor:baseCard });
  for (const value of ['yat-front-print-frame','/img/yatstats-logo-stacked-white.svg','Jamie','Example','Hometown Business','Community Partners','SPONSOR','RETIRED','CLASS OF 1996','94','95','96','Sample sponsor portrait','FLIP FOR MORE']) assert.ok(front.includes(value), value);
  assert.doesNotMatch(front, /data-playerid|player-card-id|\/player\/|\/players\/|FLIP FOR STATS|NEXT GAME|favorite/i);
});

test('existing player front retains player labels and actions across active, retired, commit, and roster cases', () => {
  // Optional pre-change source permits an exact parity check during this
  // change without making the normal test depend on a checkout or git HEAD.
  const original = process.env.SPONSOR_UI_PLAYER_BASELINE ? fs.readFileSync(process.env.SPONSOR_UI_PLAYER_BASELINE, 'utf8') : null;
  const baselineLoad = original ? createLoader({ sources:{ [frontPath]:original }, overrides:{
    'src/components/yatstats/CardPhoto.tsx':empty, 'src/components/yatstats/FavoriteButton.tsx':empty,
  } }) : null;
  const current = normalLoad(frontPath).default;
  const baseline = baselineLoad?.(frontPath).default;
  for (const status of ['ACTIVE','RETIRED','COMMIT','FREE AGENT','INJURED 60-DAY']) {
    const player = { playerid:'123', first_name:'Example', last_name:'Player', status_label:status, level_label:'MLB',
      current_team_name:'Current Team', current_org_or_conference_name:'Organization', class_of:'2016', roster_years:['2014','2015','2016'],
      committed_team_name:'College Team', is_on_40man:status==='ACTIVE', forty_man_org_abbr:'TEST', is_pitcher:false,
      color1:'#123456', color2:'#654321', last_transaction_type:'Released', last_transaction_date:'2026-01-02',
    };
    const html = markup(current, { player });
    for (const value of ['Example','Player','CLASS OF 2016','FLIP FOR STATS','MLB']) assert.ok(html.includes(value), `${status}: ${value}`);
    assert.doesNotMatch(html, /yat-sponsor-front|FLIP FOR MORE|SPONSOR/);
    if (status === 'ACTIVE') assert.match(html, /TEST 40-MAN/);
    if (status === 'COMMIT') assert.match(html, /COLLEGE TEAM COMMIT/);
    if (baseline) assert.equal(html, markup(baseline, { player }), status);
  }
});

test('back templates use one message region or one uncropped artwork region with escaped copy', () => {
  const Back = normalLoad('src/components/yatstats/SponsorCardBack.tsx').default;
  const banner = markup(Back, { card:{ ...baseCard, headline:'<script>alert(1)</script>', body:'A <b>literal</b> message & more' } });
  assert.equal((banner.match(/class="yat-sponsor-funzone"/g) || []).length, 1);
  assert.equal((banner.match(/class="yat-sponsor-banner"/g) || []).length, 1);
  assert.match(banner, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(banner, /A &lt;b&gt;literal&lt;\/b&gt; message &amp; more/);
  assert.doesNotMatch(banner, /yat-back-meta|data-player|FunZone|<script>/);
  const full = markup(Back, { card:{ ...baseCard, backTemplate:'full_image' } });
  assert.equal((full.match(/<img /g) || []).length, 1);
  assert.doesNotMatch(full, /yat-sponsor-funzone|yat-sponsor-banner|Hometown pride/);
  assert.match(full, /alt="Full sample artwork"/);
  const css = markup(normalLoad('src/components/yatstats/SponsorCardStyles.tsx').default, {});
  assert.match(css, /\.yat-sponsor-art img[^}]*object-fit:contain/);
  const copy = sponsorCardCopy({ ...baseCard, backTemplate:'share_promotion', headline:'', body:'', ctaLabel:'', ctaUrl:'' });
  assert.equal(copy.ctaUrl, 'https://5004.yatstats.com/');
  assert.match(copy.body, /invite another fan/);
});

test('the gallery shell flips only its two faces and keeps CTA clicks independent', () => {
  let flipped = false;
  const focus = [], stopped = [];
  const load = createLoader({ overrides:{
    'src/components/yatstats/CardPhoto.tsx':empty,
    'src/components/yatstats/FavoriteButton.tsx':empty,
    react:{ ...React,
    useState:()=>[flipped, value=>{flipped=value;}],
    useRef:()=>({current:{querySelector:selector=>({focus:()=>focus.push(selector)})}}),
  } }, globals:{window:{requestAnimationFrame:fn=>fn()}} });
  const Card = load('src/components/yatstats/SponsorFlipCard.tsx').default;
  let tree = Card({card:baseCard});
  assert.equal(tree.props['data-playerid'],undefined);
  assert.equal(tree.props['data-sponsor-id'],baseCard.id);
  const faces = tree.props.children[0].props.children.props.children;
  assert.equal(faces.length,2);
  faces[0].props.onSponsorFlip();
  assert.equal(flipped,true);assert.equal(focus[0],'.yat-sponsor-back-flip');
  tree = Card({card:baseCard});
  tree.props.onClick({target:{closest:()=>({tagName:'A'})},stopPropagation:()=>stopped.push(true)});
  assert.equal(flipped,true,'CTA does not flip the card');
  tree.props.onKeyDown({target:tree,currentTarget:tree,key:'Enter',preventDefault:()=>{},stopPropagation:()=>stopped.push(true)});
  assert.equal(flipped,false);
  tree = Card({card:baseCard});
  tree.props.onClick({target:{closest:()=>null},stopPropagation:()=>stopped.push(true)});
  assert.equal(flipped,true);
  assert.equal(stopped.length,3,'card events stop before legacy document listeners');
});

test('batched school request deduplicates, validates scope, and isolates failures from athletes', async () => {
  let requests = 0;
  const load = createLoader({ globals:{ fetch:async url => {
    requests++;
    if (url.endsWith('/9000')) throw new Error('offline');
    return { ok:true, json:async () => ({ cards:[baseCard, baseCard, { ...baseCard, id:'13', hsid:'2' }, { ...baseCard, id:'14', schoolIds:['2'] }, { ...baseCard, id:'15', ctaUrl:'javascript:alert(1)' }] }) };
  } } });
  const { loadSchoolSponsorCards } = load('src/components/yatstats/SponsorGalleryCards.tsx');
  const first = loadSchoolSponsorCards('5004');
  assert.equal(first, loadSchoolSponsorCards('5004'));
  const cards = await first;
  assert.equal(cards.length, 1); assert.equal(cards[0].id, '12');
  assert.equal(requests, 1);
  assert.equal((await loadSchoolSponsorCards('9000')).length, 0);
  assert.equal((await loadSchoolSponsorCards('9000')).length, 0);
  assert.equal(requests, 2);
  assert.equal((await loadSchoolSponsorCards('../5004')).length, 0);
  assert.equal(requests, 2);
});

test('preview accepts only its parent, projects fields, and clears rejected proof data', () => {
  const effects = [], changes = [], listeners = new Map(), outgoing = [];
  const parent = { postMessage:(message, origin) => outgoing.push({ message, origin }) };
  const frame = { parent, addEventListener:(name, fn) => listeners.set(name, fn), removeEventListener:() => {} };
  const load = createLoader({ overrides:{ react:{ ...React, useEffect:fn=>effects.push(fn), useState:initial=>[typeof initial === 'function' ? initial() : initial, value=>changes.push(value)] } }, globals:{ window:frame } });
  load('src/components/yatstats/SponsorCardPreview.tsx').default();
  effects.forEach(fn=>fn());
  assert.equal(outgoing.length, 1);
  assert.equal(outgoing[0].message.type, 'yatstats:sponsor-card-preview-ready');
  assert.deepEqual(Object.keys(outgoing[0].message), ['type']);
  const receive = listeners.get('message');
  receive({ source:{}, data:{ type:'yatstats:sponsor-card-preview', card:baseCard } });
  receive({ source:parent, data:{ type:'other', card:baseCard } });
  assert.equal(changes.length, 0);
  receive({ source:parent, data:{ type:'yatstats:sponsor-card-preview', card:{ ...baseCard, playerid:'no' } } });
  assert.equal(changes[0].id, baseCard.id); assert.equal(Object.hasOwn(changes[0], 'playerid'), false);
  assert.equal(changes[1], false);
  receive({ source:parent, data:{ type:'yatstats:sponsor-card-preview', card:{ ...baseCard, frontImageUrl:'javascript:bad()' } } });
  assert.equal(changes[2], null); assert.equal(changes[3], true);
});

test('standalone examples use fixed fictional data without relaxing the public guard', async () => {
  const { sponsorCardExample } = normalLoad('src/lib/partners/sponsorCardExamples.ts');
  for (const template of ['banner_text','share_promotion','full_image']) {
    const example = sponsorCardExample(template);
    assert.equal(example.sponsorName, 'Example sponsor');
    assert.equal(example.currentTeam, 'Your business');
    assert.equal(example.backTemplate, template);
    assert.equal(example.hsid, undefined);
    assert.equal(example.schoolIds.length, 0);
    assert.match(example.frontImageUrl, /^\/img\/sponsor-card-example\//);
    assert.equal(readSponsorCard(example), null, 'public messages still require HTTPS assets');
  }
  const load = createLoader({ overrides:{
    'src/components/yatstats/SponsorCardPreview.tsx':{ __esModule:true, default:({example})=>React.createElement('div', {'data-example':example || ''}) },
    'src/components/yatstats/YatStyles.tsx':empty,
  } });
  const Page = load('src/app/embed/sponsor-card/preview/page.tsx').default;
  for(const value of ['https://untrusted.test/x','<script>','banner_text&image=unsafe',['banner_text']]) {
    assert.equal(renderToStaticMarkup(await Page({searchParams:Promise.resolve({example:value})})), '<div data-example=""></div>');
  }
  assert.equal(renderToStaticMarkup(await Page({searchParams:Promise.resolve({example:'full_image'})})), '<div data-example="full_image"></div>');
});

test('only the sponsor proof bypasses school splash mutations before hydration', () => {
  const layout = fs.readFileSync(path.join(root,'src/app/layout.tsx'),'utf8');
  const literal = layout.match(/const SPLASH_BOOTSTRAP = (`[\s\S]*?`);/)[1];
  const bootstrap = vm.runInNewContext(literal);
  for(const pathname of ['/embed/sponsor-card/preview','/embed/sponsor-card/preview/','/5004','/embed/player-card/123']) {
    let cookieWrites=0, headWrites=0;
    const document = { documentElement:{}, createElement:()=>({}), head:{appendChild:()=>headWrites++} };
    Object.defineProperty(document,'cookie',{get:()=>'',set:()=>cookieWrites++});
    vm.runInNewContext(bootstrap,{document,location:{pathname,hostname:'localhost',search:''},matchMedia:()=>({matches:false}),addEventListener:()=>{},setTimeout:()=>{}});
    const proof = pathname === '/embed/sponsor-card/preview' || pathname === '/embed/sponsor-card/preview/';
    assert.equal(cookieWrites,proof?0:1,pathname);
    assert.equal(headWrites,proof?0:1,pathname);
  }
});

test('gallery filters separate sponsors from athlete status, level, name and favorites selection', () => {
  const wrap = () => ({ style:{} });
  const playerWrap = wrap(), sponsorWrap = wrap();
  const player = { dataset:{ playerid:'1', name:'Real Player', level:'MLB', status:'ACTIVE', org:'Club', gradclass:'2018', rosteryears:'2016,2017,2018' }, closest:()=>playerWrap };
  const sponsor = { dataset:{ name:'Jamie Example Sample Community Partner', level:'SPONSOR', org:'Community Partners', gradclass:'1996', rosteryears:'1994,1995,1996' }, closest:()=>sponsorWrap };
  const groups = { filterStatus:['ACTIVE'], filterLevels:[], filterOrgs:[], filterGradClass:[], filterRosterYears:[] };
  const filters = { name:'', favorites:false, favoritesGallery:false };
  const section = { dataset:{}, querySelectorAll:query=>query.includes('data-playerid')?[player]:query.includes('data-sponsor-card')?[sponsor]:[] };
  const document = { getElementById:id=>{
    if (id === 'sec-active') { section.dataset.favoritesGalleryActive = String(filters.favoritesGallery); return section; }
    if (id === 'filterName') return { value:filters.name };
    if (id === 'filterFavs') return { checked:filters.favorites };
    return groups[id] ? { querySelectorAll:()=>groups[id].map(value=>({ value, checked:true })) } : null;
  } };
  const source = fs.readFileSync(path.join(root,'src/components/yatstats/GalleryFilterController.tsx'),'utf8') + '\nexport { applyFilters as testApplyFilters };';
  const load = createLoader({ sources:{ 'src/components/yatstats/GalleryFilterController.tsx':source }, globals:{ document, window:{ dispatchEvent:()=>{} }, CustomEvent:class {} } });
  const apply = () => load('src/components/yatstats/GalleryFilterController.tsx').testApplyFilters('active');
  apply(); assert.equal(playerWrap.style.display, ''); assert.equal(sponsorWrap.style.display, '');
  groups.filterLevels=['SPONSOR']; apply(); assert.equal(playerWrap.style.display, 'none'); assert.equal(sponsorWrap.style.display, '');
  groups.filterLevels=['MLB']; apply(); assert.equal(playerWrap.style.display, ''); assert.equal(sponsorWrap.style.display, 'none');
  groups.filterLevels=[]; filters.name='jamie'; apply(); assert.equal(playerWrap.style.display, 'none'); assert.equal(sponsorWrap.style.display, '');
  filters.name=''; groups.filterRosterYears=['1995']; apply(); assert.equal(playerWrap.style.display, 'none'); assert.equal(sponsorWrap.style.display, '');
  groups.filterRosterYears=[]; groups.filterGradClass=['1990-1999']; apply(); assert.equal(sponsorWrap.style.display, '');
  groups.filterGradClass=[];
  filters.name=''; filters.favorites=true; apply(); assert.equal(sponsorWrap.style.display, 'none');
  filters.favorites=false; filters.favoritesGallery=true; apply(); assert.equal(sponsorWrap.style.display, 'none');
  const layout = fs.readFileSync(path.join(root,'src/app/[hsid]/layout.tsx'),'utf8');
  assert.match(layout, /'INDY','SPONSOR','INTERNATIONAL'/);
  const page = fs.readFileSync(path.join(root,'src/app/[hsid]/page.tsx'),'utf8');
  assert.equal((page.match(/<SponsorGalleryCards /g) || []).length, 1);
  assert.match(page, /id="active-grid">\s*<SponsorGalleryCards hsid=\{resolvedHsid\}/);
});
