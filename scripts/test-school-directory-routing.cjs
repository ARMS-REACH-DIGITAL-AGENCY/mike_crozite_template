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
assert.equal(routing.schoolHostnamePattern('5004.yatstats.com').hsid,'5004');
assert.equal(routing.schoolHostnamePattern('yatstats.com'),null);
assert.equal(routing.schoolHostnamePattern('www.yatstats.com'),null);
assert.equal(routing.schoolHostnamePattern('notreallyyatstats.com'),null);

const schools=[
  {hsid:'5004',name_slug:'hamilton',regionid:'AZ',city_slug:'chandler',same_state_city_count:1,existing:'https://hamilton.az.yatstats.com',same_state_name_count:1,existing_host_count:1},
  {hsid:'4',name_slug:'melbourne',regionid:'FL',city_slug:'melbourne',same_state_city_count:1,existing:null,same_state_name_count:1},
  {hsid:'111',name_slug:'lincoln',regionid:'CA',city_slug:'city-one',same_state_city_count:1,existing:null,same_state_name_count:2},
  {hsid:'112',name_slug:'lincoln',regionid:'CA',city_slug:'city-two',same_state_city_count:1,existing:null,same_state_name_count:2},
  {hsid:'887',name_slug:'hillsboro',regionid:'OR',city_slug:'hillsboro',same_state_city_count:1,existing:null,same_state_name_count:1},
];
const query=async (sql,params=[])=>{
  if(sql.includes('/* school-canonical-candidates */'))
    return {rows:schools.filter(s=>params[0].includes(s.hsid))};
  if(sql.includes('/* school-reserved-hosts */'))
    return {rows:[{hostname:'hillsboro.or.yatstats.com',source:'legacy'}]};
  if(sql.includes('/* school-legacy-host */'))
    return {rows:params[0]==='hamilton.az.yatstats.com'?[{hsid:'5004'}]:[]};
  if(sql.includes('/* school-numeric-host */'))
    return {rows:params[0]==='5004'?[{hsid:'5004'}]:[]};
  if(sql.includes('/* school-named-host-candidates */')) {
    const state=params[0];
    return {rows:schools.filter(s=>s.regionid===state && (
      s.name_slug===params[1] || s.hsid===params[2]
    ) && (!params[3] || s.city_slug===params[3])).map(s=>({hsid:s.hsid}))};
  }
  throw Error('Unhandled mocked SQL: '+sql.slice(0,130));
};
(async()=>{
  const urls=await routing.canonicalSchoolUrls(['5004','4','111','112','887'],query);
  assert.equal(urls.get('5004'),'https://hamilton.az.yatstats.com');
  assert.equal(urls.get('4'),'https://melbourne.fl.yatstats.com');
  assert.equal(urls.get('111'),'https://lincoln.ca.city-one.yatstats.com');
  assert.equal(urls.get('112'),'https://lincoln.ca.city-two.yatstats.com');
  assert.equal(urls.get('887'),'https://hillsboro.or.hillsboro.yatstats.com');
  for(const [url,id] of [
    ['hamilton.az.yatstats.com','5004'],
    ['5004.yatstats.com','5004'],
    ['melbourne.fl.yatstats.com','4'],
    ['lincoln.ca.city-one.yatstats.com','111'],
    ['lincoln.ca.city-two.yatstats.com','112'],
    ['hillsboro.or.hillsboro.yatstats.com','887'],
    ['lincoln.ca.yatstats.com',null],
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
  vm.runInNewContext(compiled,{exports:exportObj,require,console,URLSearchParams},{filename:'SearchDrawerTabs.js'});
  const html=exportObj.renderSchoolRows([
    {hsid:'5004',hsname:'Hamilton',hslocation:'Chandler,AZ',microsite_url:urls.get('5004'),bracket_eligible:true,current_aa:43},
    {hsid:'4',hsname:'Melbourne',hslocation:'Melbourne,FL',microsite_url:urls.get('4'),bracket_eligible:false,current_aa:38},
    {hsid:'111',hsname:'Lincoln',hslocation:'City,CA',microsite_url:urls.get('111'),bracket_eligible:false,current_aa:11},
  ],'No results',true);
  assert.ok(html.includes('href="https://melbourne.fl.yatstats.com"'), 'Melbourne must link');
  assert.ok(html.includes('href="https://lincoln.ca.city-one.yatstats.com"'), 'collision must link uniquely by school.state.city');
  assert.equal((html.match(/yat-search-school-bracket-link"/g)||[]).length,1,'only seeded Hamilton gets bracket');
  assert.ok(!html.includes('SCHOOL PAGE NOT AVAILABLE YET'),'active schools must not appear unavailable');
  console.log('PASS hostname resolution, canonical collisions, existing domains, numeric aliases, and Global Search links.');
})().catch(e=>{console.error(e);process.exitCode=1;});
