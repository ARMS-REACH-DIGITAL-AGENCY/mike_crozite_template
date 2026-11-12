const assert = require('node:assert/strict');
const { buildAuditEmail, changedParts, same } = require('../src/lib/contributionAuditDigest.js');
const afl = { org:'Arizona Fall League',team:'Glendale Desert Dogs',level:'MLB',source:'mlb_api_afl',status:'ACTIVE',teamid:'900454',display_status:'ACTIVE' };
const padres = { org:'San Diego Padres',team:'San Diego Padres',level:'MLB',source:'mlb_api',status:'ACTIVE',teamid:'24',display_status:'ACTIVE' };
const oldRyan = {org:null,team:null,level:'TRIPLE-A',source:null,status:'FREE AGENT',teamid:null,display_status:'FREE AGENT'};
const groups = [
  {entity_type:'player',entity_id:'230465',playerid:'230465',player_name:'Luke Fox',school_name:'Catholic Memorial',before_data:afl,after_data:{...afl},event_count:6,attributed_events:0,unknown_events:0,sources:['mlb_api','mlb_api_afl'],latest_source:'mlb_api_afl'},
  {entity_type:'player',entity_id:'202305',playerid:'202305',player_name:'Ryan Weiss',school_name:'South Elgin',before_data:oldRyan,after_data:padres,event_count:2,attributed_events:0,unknown_events:1,sources:['unknown','mlb_api'],latest_source:'mlb_api'}
];
const unknown = [{...groups[1],source:'unknown',occurred_at:'2026-11-11T17:24:14Z',before_data:oldRyan,after_data:{...oldRyan,status:null,display_status:null},actor_email:null,actor_uid:null}];
const r = buildAuditEmail('2026-11-11', groups, unknown, [{source:'mlb_api',events:4},{source:'mlb_api_afl',events:3},{source:'unknown',events:1}]);
assert.equal(r.totalEvents,8);
assert.equal(r.netCount,1);
assert.equal(r.revertedCount,1);
assert.equal(r.aflRevertedCount,1);
assert.equal(r.reviewCount,2);
assert.match(r.html,/Ryan Weiss/);
assert.match(r.html,/FREE AGENT → ACTIVE/);
assert.match(r.html,/UNKNOWN SOURCE/);
assert.match(r.html,/10:24 AM/);
assert.match(r.html,/not 6 genuine transfers/);
assert.ok(!r.html.includes('<pre>'));
assert.equal(changedParts(oldRyan,padres).filter(x=>x.startsWith('Status:')).length,1);
assert.equal(changedParts(oldRyan,padres).filter(x=>x.startsWith('Team ID:')).length,0);
assert.equal(same({a:1,b:2},{b:2,a:1}),true);
const html = buildAuditEmail('2026-11-11', [{...groups[1],player_name:'<b>Evil</b>'}],[],[]).html;
assert.match(html,/&lt;b&gt;Evil&lt;\/b&gt;/);
assert.ok(!html.includes('<b>Evil</b>'));
const noOp = buildAuditEmail('2026-11-11', [{...groups[0],event_count:1}],[],[]);
assert.equal(noOp.noOpCount,1);
assert.equal(noOp.revertedCount,0);
console.log('Audit digest tests passed: net changes, AFL reversions, review flags, escaping, no-ops.');
