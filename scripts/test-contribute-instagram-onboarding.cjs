// Regression contract for automatic player Instagram enrollment and profile prefill.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const parser = fs.readFileSync('src/lib/instagramHandle.ts', 'utf8');
const js = ts.transpileModule(parser,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod = {exports:{}};
new Function('module','exports',js)(mod,mod.exports);
const normalize = mod.exports.normalizeInstagramHandle;
assert.equal(typeof normalize,'function');
for (const value of ['@MaddenPezz','maddenpezz','https://www.instagram.com/maddenpezz?utm_source=ig_web_button_share_sheet&cplk=ZDNlZDc0MzIxNw==','instagram.com/maddenpezz/']) {
  assert.equal(normalize(value),'maddenpezz',value);
}
for (const value of ['https://www.instagram.com/reel/abc123/','https://www.instagram.com/p/abc','https://evil.example/maddenpezz','https://instagram.com.evil.example/maddenpezz','@invalid..dots','', 'instagram.com/explore/']) {
  assert.equal(normalize(value),null,value);
}
const route = fs.readFileSync('src/app/api/contribute/route.ts','utf8');
const correction = fs.readFileSync('src/lib/contributionPublisher.ts','utf8');
const prefill = fs.readFileSync('src/app/api/contribute/player-fields/route.ts','utf8');
const form = fs.readFileSync('src/components/yatstats/ContributePlayerInfoForm.tsx','utf8');
const enroll = fs.readFileSync('src/lib/instagramSourceEnrollment.ts','utf8');
assert.ok(route.includes('await enrollPlayerInstagramSource({ playerId, hsid, input: submitted.instagram })'));
assert.ok(correction.includes('await enrollPlayerInstagramSource({playerId:player.playerid,hsid:player.hsid,input:raw})'));
assert.ok(enroll.includes("lower(handle) = $1"));
assert.ok(enroll.includes("ON CONFLICT (platform, handle) DO NOTHING RETURNING id::text"));
assert.ok(enroll.includes("existing.rows[0].playerid === args.playerId"));
assert.ok(prefill.includes('AS instagram') && prefill.includes('AS x'));
assert.ok(form.includes('instagram:clean(p.instagram)'));
assert.ok(form.includes("body.instagram === 'registered'"));
assert.ok(route.indexOf("if (process.env.VERCEL_ENV === 'preview')") < route.indexOf("INSERT INTO news_tip_queue"));
console.log('PASS: Instagram profile URLs, enrollment idempotency, owner checks, preview safety, and form prefill');
