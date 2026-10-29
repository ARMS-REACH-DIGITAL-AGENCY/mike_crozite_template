const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname,'../src/lib/schoolNewsLinks.ts'),'utf8');
const js = ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021},
}).outputText;
const canonical = new Map([
  ['5004','https://hamilton.az.yatstats.com'],
  ['9655','https://basha.az.yatstats.com'],
  ['5005','https://alexander-hamilton.ca.yatstats.com'],
  ['999','https://yatstats.com'],
]);
for (let i = 1; i <= 8000; i++) {
  canonical.set(String(100000+i), 'https://school-'+(100000+i)+'.az.yatstats.com');
}
let batchCount = 0;
const directory = {
  schoolHostnamePattern(host) {
    if (/^[1-9]\d*\.yatstats\.com$/.test(host)) return {type:'numeric'};
    if (/^[a-z0-9-]+\.[a-z]{2}\.yatstats\.com$/.test(host)) return {type:'named'};
    return null;
  },
  async canonicalSchoolUrls(ids) {
    batchCount++;
    return new Map(ids.filter(id=>canonical.has(String(id))).map(id=>[String(id),canonical.get(String(id))]));
  },
};
const out = {exports:{}};
vm.runInNewContext(js,{
  exports:out.exports,
  require(value){
    assert.equal(value,'./schoolDirectoryRouting');
    return directory;
  },URL,Map,Set,console,
},{filename:'schoolNewsLinks.js'});
const links = out.exports;

(async ()=>{
  const ids=['5004','9655','5005','999',...Array.from({length:8000},(_,i)=>String(100001+i))];
  const map=await links.resolveSchoolNewsOrigins(ids,async()=>({rows:[]}));
  assert.equal(batchCount,1,'All school URLs should resolve in a single canonical batch');
  assert.equal(map.size,8003,'All 8000 generated schools plus three curated schools should resolve');
  assert.equal(links.schoolNewsStoryUrl(map.get('5004'),'bdc940e4ad21f6f621aa9c3579781a33'),
    'https://hamilton.az.yatstats.com/?news=1&story=bdc940e4ad21f6f621aa9c3579781a33#sec-news');
  assert.equal(links.schoolNewsReviewUrl(map.get('9655')),
    'https://basha.az.yatstats.com/contribute-review');
  assert.equal(links.schoolNewsStoryUrl(map.get('5005'),'abc-123'),
    'https://alexander-hamilton.ca.yatstats.com/?news=1&story=abc-123#sec-news');
  assert.equal(links.schoolNewsStoryUrl(map.get('108000'),'xyz'),
    'https://school-108000.az.yatstats.com/?news=1&story=xyz#sec-news');
  assert.equal(map.has('999'),false,'Corporate site must not become a school');
  assert.equal(links.schoolNewsStoryUrl('https://yatstats.com','test'),null);
  assert.equal(links.schoolNewsStoryUrl('https://evil.example','test'),null);
  assert.equal(links.schoolNewsStoryUrl('https://hamilton.az.yatstats.com','a/b'),null);
  assert.equal(links.schoolNewsReviewUrl('https://yatstats.com'),null);
  const digest=fs.readFileSync(path.resolve(__dirname,'../src/app/api/cron/social-news-digest/route.ts'),'utf8');
  const landing=fs.readFileSync(path.resolve(__dirname,'../src/app/n/[uuid]/page.tsx'),'utf8');
  assert.match(digest,/resolveSchoolNewsOrigins/);
  assert.match(digest,/schoolNewsStoryUrl/);
  assert.match(digest,/schoolNewsReviewUrl/);
  assert.doesNotMatch(digest,/https:\/\/yatstats\.com\/(?:n\/|5004\/)/);
  assert.match(landing,/schoolNewsStoryUrl/);
  console.log('PASS: dynamic school news/review links for 8000+ schools, curated URLs, safe origins and no corporate-site fallbacks');
})().catch(e=>{console.error(e);process.exitCode=1;});
