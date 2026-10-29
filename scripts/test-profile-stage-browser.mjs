/* Real Chromium navigation and pointer-click regression for PR #607.
 * No fabricated fixtures: IDs below resolve to actual staged player records.
 * Fails closed on missing pages, summary rows, or changed Game Log data.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const preview = process.env.PROFILE_PREVIEW_ORIGIN ||
  'https://mike-crozite-template-dypy9xefq-arms-reach-digital-agency.vercel.app';
const production = process.env.PROFILE_PRODUCTION_ORIGIN ||
  'https://hamilton.az.yatstats.com';
const cases = [
  {id:'213884',hsid:'5004',slug:'drew-swift',kind:'active-pro',gameLog:true},
  {id:'YAT000001',hsid:'5004',slug:'madden-pezzorello',kind:'college',gameLog:false},
  {id:'YAT000072',hsid:'5004',slug:'mike-woods',kind:'retired-coach',gameLog:false},
  {id:'162355',hsid:'971',slug:'chris-devenski',kind:'multi-stint',gameLog:true},
  {id:'222162',hsid:'9675',slug:'tyler-callihan',kind:'two-way-log',gameLog:true},
  {id:'100110',hsid:'1668',slug:'ray-williams',kind:'retired-pro',gameLog:false},
];
const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
let failures=0;
async function getPage(origin, person, hash='#ppTab-news') {
  const context=await browser.newContext({viewport:{width:1280,height:850},ignoreHTTPSErrors:false});
  await context.addCookies([{name:`yat_splash_seen_${person.hsid}`,value:'1',url:origin}]);
  const page=await context.newPage();
  const calls=[];
  page.on('request',r=>{
    const p=new URL(r.url()).pathname;
    if(p==='/api/player-game-log'||p==='/api/player-season-stats')calls.push(p);
  });
  const url=`${origin}/${person.hsid}/player/${person.id}/${person.slug}${hash}`;
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  assert(response && response.status()===200,`${person.kind} ${origin} HTTP ${response?.status()}`);
  await page.locator('#playerFunZone').waitFor({timeout:30000});
  await page.locator('a.pp-fz-tab[href="#ppTab-stats"]').first().waitFor({timeout:25000});
  return {page,context,calls};
}
async function statsTest(person) {
  const b=await getPage(production,person);
  const p=await getPage(preview,person);
  try{
    await p.page.waitForTimeout(1600);
    // Career timeline legitimately loads season stats on profile entry.
    // The Stats tab must share that same response, never fetch it again.
    assert.equal(p.calls.filter(s=>s==='/api/player-season-stats').length,1,'Expected exactly one timeline stats request');
    assert.equal(p.calls.filter(s=>s==='/api/player-game-log').length,0,'Preview eagerly loaded Game Log from News');
    for(const x of [b,p]){
      await x.page.locator('a.pp-fz-tab[href="#ppTab-stats"]').first().click({timeout:12000});
      await x.page.waitForFunction(() => {
        const panel=document.querySelector('#ppTab-stats');
        return !!panel && (!!panel.querySelector('.psi-table') || /No season-by-season stats found/.test(panel.textContent||''));
      },{timeout:40000});
    }
    const getRows=async x=>x.page.locator('#ppTab-stats .psi-table').evaluateAll(
      tables=>tables.map(t=>({
        body:[...t.querySelectorAll('tbody tr')].map(row=>row.textContent.replace(/\\s+/g,' ').trim()),
        totals:[...t.querySelectorAll('tfoot tr')].map(row=>row.textContent.replace(/\\s+/g,' ').trim())
      }))
    );
    const oldRows=await getRows(b),newRows=await getRows(p);
    assert.deepEqual(newRows,oldRows,person.kind+' Stats season rows or totals differ from production');
    if(newRows.some(x=>x.body.length)) assert(newRows.some(x=>x.totals.length),'Missing totals for existing statistics');
    console.log('STATS_PASS',person.kind,person.id, 'body',newRows.reduce((n,t)=>n+t.body.length,0),
      'totals',newRows.reduce((n,t)=>n+t.totals.length,0));
    await p.page.locator('a.pp-fz-tab[href="#ppTab-news"]').first().click();
    await p.page.locator('a.pp-fz-tab[href="#ppTab-stats"]').first().click();
    assert.equal(p.calls.filter(s=>s==='/api/player-season-stats').length,1,'Stats API duplicated after timeline/tab switching');
  }finally{await b.context.close();await p.context.close();}
}
async function gameTest(person) {
  const b=await getPage(production,person,'#ppTab-schedule');
  const p=await getPage(preview,person,'#ppTab-news');
  try{
    if(!person.gameLog){
      await p.page.locator('a.pp-fz-tab[href="#ppTab-schedule"]').first().click();
      await p.page.waitForTimeout(1200);
      if(person.kind.startsWith('retired')) assert.equal(p.calls.filter(s=>s==='/api/player-game-log').length,0,'Retired profile unexpectedly fetched Game Log');
      // Active players may have a valid empty Game Log. A request returning
      // no records is not an invented game and must remain distinguishable.
      console.log('NO_GAMELOG_PASS',person.id);
      return;
    }
    await b.page.locator('#ppTab-schedule .pst-table tbody tr').first().waitFor({timeout:45000,state:'attached'});
    assert.equal(p.calls.filter(s=>s==='/api/player-game-log').length,0,'Preview eagerly loaded Game Log');
    await p.page.locator('a.pp-fz-tab[href="#ppTab-schedule"]').first().click({timeout:12000});
    await p.page.locator('#ppTab-schedule .pst-table tbody tr').first().waitFor({timeout:45000,state:'attached'});
    const extract=async x=>x.page.locator('#ppTab-schedule').evaluate(root=>({
      heads:[...root.querySelectorAll('.pst-table th')].map(x=>x.textContent.trim()),
      years:[...root.querySelectorAll('.pst-season')].map(x=>x.textContent.trim()),
      rows:[...root.querySelectorAll('.pst-table tbody tr')].map(x=>x.textContent.replace(/\\s+/g,' ').trim())
    }));
    const oldRows=await extract(b),newRows=await extract(p);
    assert.deepEqual(newRows,oldRows,person.kind+' Game Log tables differ from production');
    assert.equal(p.calls.filter(s=>s==='/api/player-game-log').length,1,'Game Log fetched more than once');
    console.log('GAMELOG_PASS',person.kind,person.id,'rows',newRows.rows.length);
  }finally{await b.context.close();await p.context.close();}
}
try{
  for(const person of cases) {
    for(const fn of [statsTest,gameTest]){
      try{await fn(person)}catch(e){failures++;console.error('REGRESSION_FAIL',person.kind,fn.name,String(e?.stack||e).slice(0,1800));}
    }
  }
}finally{await browser.close();}
if(failures)throw new Error(`${failures} browser regressions detected`);
console.log('BROWSER_REGRESSION_PASS',cases.length,'real-player scenarios');
