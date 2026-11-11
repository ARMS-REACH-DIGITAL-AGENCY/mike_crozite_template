const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const output={exports:{}};
vm.runInNewContext(ts.transpileModule(read('src/lib/socialNewsScoutPolicy.ts'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}
}).outputText,{exports:output.exports,Date,RegExp,Set});
const p=output.exports, now=Date.parse('2026-10-31T05:00:00Z');
assert.equal(p.postIsFresh('2026-10-30T20:00:00Z',now),true);
assert.equal(p.postIsFresh('2024-10-21T20:00:00Z',now),false);
assert.equal(p.postIsFresh('2026-10-21T20:00:00Z',now),false);
const people=[
{hsid:'5004',playerid:'195486',first_name:'Justin',last_name:'Wylie',status_label:'ACTIVE',handles:['jdubsjuicebox']},
{hsid:'5004',playerid:'317316',first_name:'Roch',last_name:'Cholowsky',status_label:'ACTIVE',handles:['rochcholowsky']},
{hsid:'5004',playerid:'200',first_name:'Old',last_name:'Alumnus',status_label:'RETIRED',handles:['oldalumnus']},
{hsid:'3000',playerid:'400',first_name:'Other',last_name:'School',status_label:'ACTIVE',handles:['other']}];
const post={hsid:'5004',playerid:'195486',owner_type:'player',handle:'jdubsjuicebox',caption:'Interview with Daniel Johnson'};
assert.equal(p.findAlumniCandidates(post,people).length,1);
const candidates=p.findAlumniCandidates(post,people);
const verdict={decision:'publish',subject_playerid:'195486',category:'signing',confidence:.96,
headline:'Justin Wylie signs a new contract',summary:'Justin Wylie signed a baseball contract today.',
evidence:'I signed a new professional contract',reason:'confirmed',family_safe:true,duplicate:false};
assert.equal(p.approvedNews(verdict,candidates),true);
assert.equal(p.approvedNews({...verdict,subject_playerid:'12345'},candidates),false);
assert.equal(p.approvedNews({...verdict,decision:'ignore'},candidates),false);
assert.equal(p.approvedNews({...verdict,confidence:.7},candidates),false);
assert.equal(p.approvedNews({...verdict,duplicate:true},candidates),false);
assert.equal(p.approvedNews({...verdict,family_safe:false},candidates),false);
assert.equal(p.approvedNews({...verdict,evidence:'short'},candidates),false);
assert.equal(p.findAlumniCandidates({...post,owner_type:'school',playerid:null,
caption:'Great news about @rochcholowsky'},people)[0].playerid,'317316');
assert.equal(p.findAlumniCandidates({...post,owner_type:'school',playerid:null,
caption:'@oldalumnus and @other'},people).length,0);
const scout=read('src/lib/socialNewsScout.ts');
assert.match(scout,/p\.published_at>=now\(\)-interval '7 days'/);
assert.match(scout,/f\.status_label=ANY\(\$2::text\[\]\)/);
assert.match(scout,/approvedNews\(verdict,candidates\)/);
assert.match(scout,/social_news_scout_run/);
assert.match(scout,/social_news_scout_evaluated/);
assert.doesNotMatch(scout,/classifySocialNewsCaption/);
const vercel=JSON.parse(read('vercel.json'));
assert.ok(vercel.crons.some(x=>x.path==='/api/cron/social-news-scout'&&x.schedule==='12,27,42,57 * * * *'));

const Bauer={hsid:'2039',playerid:'150704',first_name:'Trevor',last_name:'Bauer',status_label:'ACTIVE',handles:['baueroutage','estrellasbc']};
const teamAccount={hsid:'2039',playerid:'150704',owner_type:'player',authorization_type:'user_requested_team_account',handle:'estrellasbc',caption:'Hoy tenemos pelota y noche de damas en el Tetelo'};
assert.equal(p.sourceIsPlayerOwned(teamAccount.owner_type,teamAccount.authorization_type),false);
assert.equal(p.findAlumniCandidates(teamAccount,[Bauer]).length,0,'Team-owned account is not a player announcement');
assert.equal(p.findAlumniCandidates({...teamAccount,caption:'Trevor Bauer wins player of the week'},[Bauer]).length,1,'Verified full name can be news');
assert.equal(p.findAlumniCandidates({...teamAccount,caption:'Bauer Day!'},[Bauer]).length,0,'Surname alone is not enough');
assert.equal(p.findAlumniCandidates({...teamAccount,authorization_type:'user_requested_public_reference',handle:'baueroutage'},[Bauer]).length,1);
assert.equal(p.newsApprovalIssue({...verdict,subject_playerid:'12345'},candidates),'unverified_player_subject');
assert.equal(p.newsApprovalIssue({...verdict,confidence:.5},candidates),'insufficient_confidence');
assert.equal(p.newsApprovalIssue({...verdict,category:'league_status',headline:'Trevor Bauer discusses MLB eligibility',subject_playerid:'150704'},[Bauer]),null);
assert.match(read('src/lib/socialNewsScout.ts'), /outside_active_alumni_scope/);
assert.match(read('src/lib/socialNewsScout.ts'), /sourceIsPlayerOwned/);
assert.match(read('src/lib/socialNewsScout.ts'), /approvalIssue/);
assert.match(read('src/lib/socialNewsScout.ts'), /s\.authorization_type/);
assert.match(read('src/lib/socialNewsScoutJudge.ts'), /league_status/);

console.log('PASS: Active Alumni 7-day AI Scout, roster identity, deduping, 15-minute cron and audit safeguards');
