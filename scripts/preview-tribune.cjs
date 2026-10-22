/** Design proof ONLY. All game statistics below are synthetic and visibly labeled.
 * The roster fixture is the public Hamilton roster read on 2026-10-22.
 * No fixture is imported by production code and this script never sends mail.
 */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname,'..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id,...args){return resolve.call(this,id.startsWith('@/')?path.join(root,'src',id.slice(2)):id,...args)};
require.extensions['.ts'] = (mod,file) => mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const { scoreLiveIndex,scoreLiveSchoolWeek } = require('../src/lib/bracket/scoreLive.ts');
const { toProductionTournamentIndex } = require('../src/lib/bracket/productionIndex.ts');
const { toTribuneRoster,toTribuneMatchup } = require('../src/lib/tribune/tournament.ts');
const { renderTribuneHtml,renderTribuneText } = require('../src/lib/tribune/render.ts');
const home=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/tribune-hamilton-roster.json'),'utf8'));
const start='2027-02-01',end='2027-02-07',asOf='2027-02-08';
const live={asOf:asOf+'T11:00:00Z',start,weeks:1,roster:{'5004':home.map(p=>[p.playerid,p.display_name,p.level,p.is_pitcher?1:0,p.current_team_name||''])},lines:[],clubs:{},games:{},fans:{}};
// Opposing sample lines are solely to demonstrate the tournament engine/scorecard.
live.roster['15525']=Array.from({length:15},(_,i)=>['sample-opponent-'+i,'Illustrative opposing alumnus '+(i+1),'NCAA-D1',i>7?1:0,'Illustrative club '+i]);
function club(clubName,i,boost){
 if(!clubName||live.clubs[clubName])return;
 live.clubs[clubName]=Array.from({length:7},(_,d)=>[d,clubName+'-'+d,(d+i)%(boost?4:3)?1:0,((d+i)%3)-1]);
 live.games[clubName]=Array.from({length:7},(_,d)=>[d,clubName+'-'+d,1,1,Date.parse(start+'T20:00:00Z')+d*86400000]);
}
// Synthetic game cards: AB, H, 2B, 3B, HR, BB, HBP, SF. Selecting a card
// independently of the appearance gate keeps walks and extra-base hits possible.
// Each card is a plausible single game; the seven-day sequence caps a batter at
// two home runs while mixing quiet games, walks and a few headline-worthy lines.
const battingCards=[
 [4,1,0,0,0,0,0,0], [4,0,0,0,0,1,0,0],
 [4,2,1,0,0,0,0,0], [3,1,0,0,0,1,0,0],
 [4,1,0,0,1,0,0,0], [5,2,1,0,0,0,0,0],
 [3,0,0,0,0,2,0,0], [4,2,0,0,0,0,1,0],
 [4,3,1,0,1,1,0,0], [4,1,1,0,0,0,0,1],
 [4,0,0,0,0,0,0,0], [3,2,0,1,0,1,0,0],
 [5,1,0,0,0,0,0,0], [4,2,0,0,0,1,0,0],
 [3,1,0,0,0,0,1,0], [4,1,1,0,0,1,0,0],
];
for(const [school,players] of Object.entries(live.roster))for(const [i,p] of players.entries()){
 const boost=school==='5004';club(p[4],i,boost);
 if(i%5===0)continue; // Demonstrates true no-appearance rows in BOTH proofs.
 for(let d=0;d<7;d++){
  if(!p[3]&&((i+d)%3!==0)){
   const [ab,h,doubles,triples,hr,bb,hbp,sf]=battingCards[(i*11+d*7+(boost?3:0))%battingCards.length];
   live.lines.push([school,p[0],d,'b',[ab+bb+hbp+sf,ab,h,doubles,triples,hr,bb,hbp,sf],p[4]+'-'+d,p[4],1,p[2]]);
  }
  if(p[3]&&d===i%7){const edge=boost?[false,true,true,false,true,false,false][d]:![false,true,true,false,true,false,false][d];const k=edge?8+i%3:3+i%3,outs=18;live.lines.push([school,p[0],d,'p',[outs,edge?0:2,edge?1:3,0,k,edge?4:7,edge?1:5,edge?1:5],p[4]+'-'+d,p[4],1,p[2]]);}
 }
}
// Two-way roster members retain both roles without fabricating a batting appearance.
let index=toProductionTournamentIndex(JSON.parse(fs.readFileSync(path.join(root,'public/bracket-lab/2026/index.json'),'utf8')));
index.rounds=index.rounds.map(r=>({...r,series:r.series.filter(s=>s[1]===5004||s[2]===5004)}));
const scored=scoreLiveIndex(index,live,asOf);index=scored.index;
const game=index.rounds[0].series[0][7][0],box=scored.boxes[String(game[0])];
const matchup=toTribuneMatchup({game,index,box,liveInning:scored.innings[String(game[0])],asOf});
const roster=toTribuneRoster({title:'Hamilton High School · Chandler, AZ',schoolId:'5004',roster:home,sideBox:box.h,metrics:{opsPlus:box.d[7][0],fipMinus:box.d[7][2]},available:true,schoolUrl:'https://hamilton.az.yatstats.com'});
const exampleFollows={title:'Your other-school favorites',playerCount:3,batting:{kind:'batting',rows:[
 {id:'proof-follow-1',name:'Alex Rivera',team:'Illustrative college team',school:'Example High School',level:'NCAA-D1',state:'played',cells:['138','3-1','12','5','1','0','1','2','0','0','.500','.750','1.250']},
 {id:'proof-follow-2',name:'Jordan Lee',team:'Illustrative professional team',school:'Another Example High School',level:'DOUBLE-A',state:'no-appearance',cells:['0','2-2','0','0','0','0','0','0','0','0','.000','.000','.000']}
 ],totals:['—','5-3','12','5','1','0','1','2','0','0','.500','.750','1.250']},pitching:{kind:'pitching',rows:[
 {id:'proof-follow-3',name:'Sam Carter',team:'Illustrative college team',school:'Example Preparatory',level:'NCAA-D1',state:'played',cells:['72','4-0','6.0','4','1','1','0','1','0','8','.833','8.00','1.83']}
 ],totals:['—','4-0','6.0','4','1','1','0','1','0','8','.833','8.00','1.83']},note:'The three other-school names and lines in this proof are fictional examples. Live SuperFan editions use only that recipient’s selected players; none affect the home-school result.'};
const batLeader=roster.batting.rows.filter(r=>r.state==='played').sort((a,b)=>Number(b.cells[0])-Number(a.cells[0]))[0];
const pitLeader=roster.pitching.rows.filter(r=>r.state==='played').sort((a,b)=>Number(a.cells[0])-Number(b.cells[0]))[0];
const win=matchup.home.total>matchup.away.total;
const edition={
 layoutVersion:'tribune-v1',preview:true,dataStatus:'illustrative',generatedAt:asOf+'T11:00:00Z',
 school:{id:'5004',name:'Hamilton',nickname:'Huskies',location:'Chandler, Arizona',color:'#7b223b',logoUrl:'https://yatstats-assets.s3.us-west-2.amazonaws.com/schools/5004.png'},
 recipientTier:'superfan',period:{cadence:'weekly',start,end,label:'February 1–7, 2027'},matchup,homeRoster:roster,follows:exampleFollows,
 story:{headline:win?'Different ballparks. One big hometown win.':'A close score. A hometown full of stories.',deck:win?`Hamilton takes the weekly fantasy matchup ${matchup.home.total}–${matchup.away.total} against Campo Verde. Here’s how the alumni made their mark.`:`Hamilton’s alumni bring the bats, but Campo Verde takes this week’s fantasy matchup ${matchup.away.total}–${matchup.home.total}. The box scores tell the hometown story.`,source:'preview',paragraphs:[
  `They wore different uniforms and took the field in different places. But on this fantasy scorecard, the Hamilton alumni had something in common: every real-world line came home to the same dugout. This sample week ends with Hamilton at ${matchup.home.total} and Campo Verde at ${matchup.away.total}.`,
  `${batLeader.name} supplied a headline-worthy line in this illustrative edition: ${batLeader.cells[3]} hits in ${batLeader.cells[2]} at-bats, ${batLeader.cells[6]} home runs and an OPS+ of ${batLeader.cells[0]}. On the pitching side, ${pitLeader.name} checked in with ${pitLeader.cells[9]} strikeouts over ${pitLeader.cells[2]} innings and a FIP− of ${pitLeader.cells[0]}. Different jobs. Shared hometown pride.`,
  `The eighth inning put the whole week on the scale: Hamilton’s ${matchup.home.opsPlus[7]} OPS+ against Campo Verde’s ${matchup.away.opsPlus[7]}, and ${matchup.home.fipMinus[7]} FIP− against ${matchup.away.fipMinus[7]}. The ninth brought the alumni clubs’ records into the picture. That’s our kind of long game—one week, nine innings, and plenty to talk about back home.`
 ]},
 sponsor:{id:'preview-tpc',name:'The Travel Protection Club',label:'SAMPLE PLACEMENT · SUBJECT TO SCHOOL SPONSOR ASSIGNMENT',headline:'Hometown pride travels well.',body:'Follow the alumni. Plan your next baseball adventure. This space carries the school sponsor’s approved offer, image and call to action.',url:'https://tpc.armsreachdigital.agency',cta:'MEET THE COMMUNITY PARTNER →'},
 links:{hub:'https://hamilton.az.yatstats.com/',tournament:'https://hamilton.az.yatstats.com/#sec-fantasy',share:'https://hamilton.az.yatstats.com/#sec-fantasy',sponsorInquiry:'https://yatstats.com/partners/'},
 notices:['Design proof only. Game results, all player performance numbers and the fictional other-school follow list are illustrative. The 43-player home roster was read from the public Hamilton hub on October 22, 2026. Sponsorship shown is an example placement, not a confirmed newsletter booking.'],
};
const out=path.join(root,'review');fs.mkdirSync(out,{recursive:true});
function write(name,e){const html=renderTribuneHtml(e);fs.writeFileSync(path.join(out,name+'.html'),html);fs.writeFileSync(path.join(out,name+'.txt'),renderTribuneText(e));fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(e,null,2));console.log(name,{bytes:Buffer.byteLength(html),home:e.homeRoster.playerCount,batters:e.homeRoster.batting.rows.length,pitchers:e.homeRoster.pitching.rows.length,score:e.matchup?.home.total+'-'+e.matchup?.away.total});}
write('The-YAT-A-BOY-Tribune-Weekly',edition);
const daily=structuredClone(edition),dailyEnd='2027-02-03',dailyAsOf='2027-02-04';
const dlive={...live,lines:live.lines.filter(l=>l[2]<=2),clubs:Object.fromEntries(Object.entries(live.clubs).map(([k,v])=>[k,v.filter(g=>g[0]<=2)])),games:Object.fromEntries(Object.entries(live.games).map(([k,v])=>[k,v.filter(g=>g[0]<=2)]))};
const dscored=scoreLiveIndex(index,dlive,dailyAsOf),dg=dscored.index.rounds[0].series[0][7][0],db=dscored.boxes[String(dg[0])];
daily.generatedAt=dailyAsOf+'T11:00:00Z';daily.period={cadence:'daily',start:dailyEnd,end:dailyEnd,label:'February 3, 2027'};
daily.homeRoster=toTribuneRoster({title:roster.title,schoolId:'5004',roster:home,sideBox:db.h,metrics:{opsPlus:db.d[2][0],fipMinus:db.d[2][2]},day:2,available:true,schoolUrl:'https://hamilton.az.yatstats.com'});
daily.matchup=toTribuneMatchup({game:dg,index:dscored.index,box:db,liveInning:dscored.innings[String(dg[0])],asOf:dailyAsOf});
daily.recipientTier='fan';delete daily.follows;
daily.story={headline:'The week’s still young. The hometown race is on.',deck:`Through Wednesday’s posted innings: Hamilton ${daily.matchup.home.total}, Campo Verde ${daily.matchup.away.total}. Today’s tables cover Wednesday only.`,source:'preview',paragraphs:[
 'The morning paper has two stories to tell: what the alumni produced yesterday, and where those performances leave the weekly fantasy matchup. The scorecard tracks the week; the box scores below are this edition’s daily slice.',
 'There is still baseball ahead. The unplayed innings stay open, and the weekly comparisons wait for the full picture. Every alumnus keeps a line in the paper—even on a day without an appearance.'
]};
write('The-YAT-A-BOY-Tribune-Daily',daily);
