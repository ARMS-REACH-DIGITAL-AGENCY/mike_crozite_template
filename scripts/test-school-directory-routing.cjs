const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname,'../src/lib/schoolDirectoryRouting.ts'),'utf8');
const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText;
const out = { exports: {} };
vm.runInNewContext(js,{exports:out.exports,URL,console}, {filename:'schoolDirectoryRouting.js'});
const routing=out.exports;

assert.equal(routing.schoolNameSlug('St. Mary & Joseph'), 'st-mary-joseph');
assert.equal(routing.schoolHostnamePattern('hamilton.az.yatstats.com').slug,'hamilton');
assert.equal(routing.schoolHostnamePattern('st-francis.mountain-view.ca.yatstats.com').city,'mountain-view');
assert.equal(routing.schoolHostnamePattern('st-francis.la-canada.ca.yatstats.com').slug,'st-francis');
assert.equal(routing.schoolHostnamePattern('st-francis.watsonville.ca.yatstats.com').state,'CA');
assert.equal(routing.schoolHostnamePattern('5004.yatstats.com').hsid,'5004');
assert.equal(routing.schoolHostnamePattern('yatstats.com'),null);
assert.equal(routing.schoolHostnamePattern('www.yatstats.com'),null);
assert.equal(routing.schoolHostnamePattern('notreallyyatstats.com'),null);

const schools=[
  {hsid:'5004',name_slug:'hamilton',regionid:'AZ',existing:'https://hamilton.az.yatstats.com',same_state_name_count:1,same_name_city_count:1},
  {hsid:'4',name_slug:'melbourne',regionid:'FL',existing:null,same_state_name_count:1,same_name_city_count:1},
  {hsid:'111',name_slug:'lincoln',city_slug:'san-jose',regionid:'CA',existing:null,same_state_name_count:2,same_name_city_count:1},
  {hsid:'112',name_slug:'lincoln',city_slug:'los-angeles',regionid:'CA',existing:null,same_state_name_count:2,same_name_city_count:1},
  {hsid:'887',name_slug:'hillsboro',city_slug:'hillsboro',regionid:'OR',existing:null,same_state_name_count:1,same_name_city_count:1},
  {hsid:'2122',name_slug:'st-francis',city_slug:'mountain-view',regionid:'CA',existing:'https://st-francis.mountain-view.ca.yatstats.com',same_state_name_count:3,same_name_city_count:1},
];
const query=async (sql,params=[])=>{
  if(sql.includes('same_name_city_count'))
    return {rows:schools.filter(s=>params[0].includes(s.hsid))};
  if(sql.includes('LOWER(BTRIM(microsite_url') && sql.includes('ANY('))
    return {rows:[{url:'https://hillsboro.or.yatstats.com'}]};
  if(sql.includes('LOWER(BTRIM(microsite_url') && sql.includes('LIMIT 2'))
    return {rows:params[0]==='https://hamilton.az.yatstats.com'?[{hsid:'5004'}]:[]};
  if(sql.includes('EXISTS') && sql.includes('LIMIT 1'))
    return {rows:params[0]==='5004'?[{hsid:'5004'}]:[]};
  if(sql.includes('LIMIT 30')) {
    const state=params[0];
    return {rows:schools.filter(s=>s.regionid===state && (
      params[2]
        ? s.name_slug===params[1] && (s.city_slug===params[2] || s.city_slug+'-'+s.hsid===params[2])
        : s.name_slug===params[1] || (s.name_slug+'-'+s.city_slug)===params[1] || (s.name_slug+'-'+s.hsid)===params[1]
    )).map(s=>({hsid:s.hsid,name_slug:s.name_slug}))};
  }
  throw Error('Unhandled mocked SQL: '+sql.slice(0,130));
};
(async()=>{
  const urls=await routing.canonicalSchoolUrls(['5004','4','111','112','887'],query);
  assert.equal(urls.get('5004'),'https://hamilton.az.yatstats.com');
  assert.equal(urls.get('4'),'https://melbourne.fl.yatstats.com');
  assert.equal(urls.get('111'),'https://lincoln-san-jose.ca.yatstats.com');
  assert.equal(urls.get('112'),'https://lincoln-los-angeles.ca.yatstats.com');
  assert.ok(!urls.get('111').includes('-111'), 'School ID must not replace a readable city');
  assert.equal(urls.get('887'),'https://hillsboro.or.yatstats.com', 'A unique school never acquires a city label even when the base URL is already claimed.');
  const curated=await routing.canonicalSchoolUrls(['2122'],query);
  assert.equal(curated.get('2122'),'https://st-francis.mountain-view.ca.yatstats.com','Verified curated same-name city host wins.');
  // Invalid and oversized IDs must remain no-match inputs, never PostgreSQL
  // integer-cast errors or a reason to run the expensive player-link lookup.
  let invalidCalls=0;
  const invalidUrls=await routing.canonicalSchoolUrls([
    '', '0', '-1', '01', '1.5', '2147483648', '9'.repeat(300), NaN, Infinity,
  ],async()=>{invalidCalls++;throw Error('Invalid IDs must not reach SQL');});
  assert.equal(invalidUrls.size,0);
  assert.equal(invalidCalls,0);
  const mixedCalls=[];
  const mixedUrls=await routing.canonicalSchoolUrls([
    5004, '5004', '4', '2147483647', '2147483648', '9'.repeat(300),
  ],async(sql,params)=>{mixedCalls.push({sql,params});return query(sql,params);});
  assert.deepEqual(Array.from(mixedCalls[0].params[0]),['5004','4','2147483647']);
  assert.equal(mixedUrls.get('5004'),urls.get('5004'));
  assert.equal(mixedUrls.get('4'),urls.get('4'));
  assert.equal(mixedUrls.has('2147483647'),false,'An unmatched ID must not gain a generated URL.');
  // A single requested school still sees collisions with unrequested schools.
  const oneCollision=await routing.canonicalSchoolUrls(['111'],query);
  assert.equal(oneCollision.get('111'),'https://lincoln-san-jose.ca.yatstats.com');
  // URL enrichment must handle the complete statewide list, including IDs
  // without player links, rather than truncating results to a 30-row page.
  const statewideIds=Array.from({length:207},(_,i)=>String(20000+i));
  const statewideCalls=[];
  const statewideUrls=await routing.canonicalSchoolUrls(statewideIds,async(sql,params)=>{
    statewideCalls.push({sql,params});
    if(sql.includes('same_name_city_count')) return {rows:statewideIds.slice(0,-1).map(id=>({
      hsid:id,name_slug:`school-${id}`,city_slug:'sample',regionid:'AZ',existing:null,same_state_name_count:1,same_name_city_count:1,
    }))};
    return {rows:[]};
  });
  assert.equal(statewideCalls.length,2,'One batch lookup and one claimed-host check.');
  assert.deepEqual(Array.from(statewideCalls[0].params[0]),statewideIds);
  assert.equal(statewideUrls.size,206);
  assert.equal(statewideUrls.get('20205'),'https://school-20205.az.yatstats.com');
  assert.equal(statewideUrls.has('20206'),false,'Only player-linked rows may receive URLs.');
  for(const [url,id] of [
    ['hamilton.az.yatstats.com','5004'],
    ['5004.yatstats.com','5004'],
    ['melbourne.fl.yatstats.com','4'],
    ['lincoln-111.ca.yatstats.com','111'],
    ['lincoln-112.ca.yatstats.com','112'],
    ['hillsboro-887.or.yatstats.com','887'],
    ['lincoln.ca.yatstats.com',null],
    ['lincoln-111.ca.yatstats.com','111'],
    ['lincoln.la-canada.ca.yatstats.com',null],
    ['st-francis.mountain-view.ca.yatstats.com','2122'],
    ['arbitrary.ca.yatstats.com',null],
    ['admin.yatstats.com',null],
  ]) {
    assert.equal(await routing.resolveSchoolHsidFromHost(url,query),id, url);
  }
  const drawer=fs.readFileSync(path.resolve(__dirname,'../src/components/yatstats/SearchDrawerTabs.tsx'),'utf8')
    .replace("import { track } from '@/lib/analytics';",'const track = () => {};');
  const compiled=ts.transpileModule(drawer,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2021}
  }).outputText;
  const exportObj={};
  vm.runInNewContext(compiled,{exports:exportObj,require:(name) => name === './FavoriteButton' ? {loadFavoriteIds:()=>[]} : require(name),console,URLSearchParams},{filename:'SearchDrawerTabs.js'});
  const html=exportObj.renderSchoolRows([
    {hsid:'5004',hsname:'Hamilton',hslocation:'Chandler,AZ',microsite_url:urls.get('5004'),bracket_eligible:true,current_aa:43},
    {hsid:'4',hsname:'Melbourne',hslocation:'Melbourne,FL',microsite_url:urls.get('4'),bracket_eligible:false,current_aa:38},
    {hsid:'111',hsname:'Lincoln',hslocation:'City,CA',microsite_url:urls.get('111'),bracket_eligible:false,current_aa:11},
  ],'No results',true);
  assert.ok(html.includes('href="https://melbourne.fl.yatstats.com"'), 'Melbourne must link');
  assert.ok(html.includes('href="https://lincoln-san-jose.ca.yatstats.com"'), 'Unprovisioned collision retains the reachable legacy hostname');
  assert.equal((html.match(/yat-search-school-bracket-link"/g)||[]).length,1,'only seeded Hamilton gets bracket');
  assert.ok(!html.includes('SCHOOL PAGE NOT AVAILABLE YET'),'active schools must not appear unavailable');
  // Platform-wide middleware contract: all school hostnames resolve by exact
  // canonical identity, never by a school-specific host->HSID map.
  const srcMiddlewareSource=fs.readFileSync(path.resolve(__dirname,'../src/middleware.ts'),'utf8');
  const rootMiddlewareSource=fs.readFileSync(path.resolve(__dirname,'../middleware.ts'),'utf8');
  assert.ok(!srcMiddlewareSource.includes('verifiedStFrancisHsids'), 'No special school map in src middleware');
  assert.ok(!rootMiddlewareSource.includes('verifiedStFrancisHostIds'), 'No special school map in active root middleware');

  const rootJs=ts.transpileModule(rootMiddlewareSource,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}
  }).outputText;
  const rootExports={};
  const mwResponse={
    next: (options={})=>({kind:'next',headers:options.request?.headers}),
    rewrite: (dest, options={})=>({kind:'rewrite',path:dest.pathname,search:dest.search,headers:options.request?.headers}),
    redirect: (dest,code)=>({kind:'redirect',url:String(dest),status:code}),
  };
  const hostToHsid={
    'st-francis.la-canada.ca.yatstats.com':'2123',
    'st-francis.mountain-view.ca.yatstats.com':'2122',
    'st-francis.watsonville.ca.yatstats.com':'9559',
    'hamilton.az.yatstats.com':'5004',
    'lincoln-san-jose.ca.yatstats.com':'111',
    '2122.yatstats.com':'2122'
  };
  let resolverCalls=0;
  vm.runInNewContext(rootJs,{
    exports:rootExports,
    require:(name)=>{
      if(name==='next/server')return {NextResponse:mwResponse};
      if(name==='./src/lib/schoolDirectoryRouting')return {schoolHostnamePattern:routing.schoolHostnamePattern};
      return require(name);
    },
    URL, Headers, console, AbortSignal, process:{env:{ROOT_DOMAIN:'yatstats.com'}},
    fetch:async (url,options)=>{
      resolverCalls++;
      const hostname=options.headers['x-yat-school-host'];
      const id=hostToHsid[hostname]||null;
      return {ok:true,json:async()=>({hsid:id,canonicalUrl:id?'https://'+hostname:null})};
    }
  },{filename:'root-middleware.js'});
  for(const [domain,id] of Object.entries(hostToHsid)){
    for(const pathname of ['/','/player/215409/andrew-martinez']){
      const url=new URL('https://'+domain+pathname+'?view=alltime&player=215409');
      url.clone=function(){const copy=new URL(this);copy.clone=this.clone;return copy};
      const request={headers:new Headers({host:domain}),nextUrl:url,url:String(url)};
      const result=await rootExports.middleware(request);
      assert.equal(result.kind,'rewrite',domain+' '+pathname+' must rewrite');
      assert.equal(result.path,'/'+id+(pathname==='/'?'':pathname),domain+' should route by exact HSID');
      assert.equal(result.search,'?view=alltime&player=215409','selected player query preserved');
      assert.equal(result.headers.get('x-yat-resolved-host-hsid'),id);
      assert.equal(result.headers.get('x-yat-internal-school-rewrite'),'1');
    }
  }
  // Existing numeric paths must NOT receive two prefixes or redirect loops.
  const numeric=new URL('https://st-francis.mountain-view.ca.yatstats.com/2122');
  numeric.clone=function(){const copy=new URL(this);copy.clone=this.clone;return copy};
  const already=await rootExports.middleware({headers:new Headers({host:numeric.hostname}),nextUrl:numeric,url:String(numeric)});
  assert.equal(already.kind,'next','Existing numeric HSID route remains unchanged');
  const unrelated=new URL('https://yatstats.com/');
  unrelated.clone=function(){const copy=new URL(this);copy.clone=this.clone;return copy};
  const base=await rootExports.middleware({headers:new Headers({host:unrelated.hostname}),nextUrl:unrelated,url:String(unrelated)});
  assert.equal(base.kind,'next','Root domain is not a school');
  assert.equal(resolverCalls,10,'Five named hostnames resolved once for each page navigation, numeric skips lookup');

  console.log('PASS hostname resolution, canonical collisions, existing domains, safe integer IDs, complete statewide URL batches, numeric aliases, and Global Search links.');
})().catch(e=>{console.error(e);process.exitCode=1;});
