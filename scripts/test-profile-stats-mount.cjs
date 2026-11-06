'use strict';
// Guard against replacing React-owned profile markup from a client effect.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const page=read('src/app/[hsid]/player/[playerId]/[slug]/page.tsx');
const injector=read('src/components/yatstats/ProfileStatsInjector.tsx');
assert.match(page,/id="ppTab-stats"[\s\S]{0,250}id="pp-stats-injector-target"/,
  'The server-rendered Stats tab must include a dedicated client-owned injection target');
assert.match(page,/id="pp-stats-server-fallback"/,
  'Server stats fallback must stay React-owned and preserved');
assert.match(injector,/panel\?\.querySelector<HTMLElement>\('#pp-stats-injector-target'\)/,
  'Client stats must target the dedicated mount');
assert.doesNotMatch(injector,/panel\.innerHTML\s*=/,
  'Never erase the server-rendered Stats panel during hydration');
assert.match(injector,/fallback\.hidden\s*=\s*true/,
  'Hide legacy server fallback only after the verified client stats load');
console.log('PASS: profile stats use React-safe isolated DOM mount');
