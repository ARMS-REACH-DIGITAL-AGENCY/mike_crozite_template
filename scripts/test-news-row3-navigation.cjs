'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const source = read('src/lib/newsStoryNavigation.ts');
const compiled = ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021},
}).outputText;
const out = {exports:{}};
vm.runInNewContext(compiled,{exports:out.exports,URL,console},{filename:'newsStoryNavigation.js'});
const clean = out.exports.dismissSchoolNewsStoryParam;
const story = 'bdc940e4ad21f6f621aa9c3579781a33';
assert.equal(clean('https://hamilton.az.yatstats.com/?news=1&story='+story+'#sec-news'),
  '/?news=1#sec-news','Row 3 must clear the pinned Kris story');
assert.equal(clean('https://basha.az.yatstats.com/?news=1&story=abc&sort=newest#sec-news'),
  '/?news=1&sort=newest#sec-news','Unrelated news filters survive');
assert.equal(clean('https://5004.yatstats.com/5004?story=abc#sec-news'),
  '/5004#sec-news','Numeric school paths survive');
assert.equal(clean('https://school-15000.ca.yatstats.com/?story=abc&news=1#sec-news'),
  '/?news=1#sec-news','Generated school routes work');
assert.equal(clean('https://hamilton.az.yatstats.com/?news=1#sec-news'),null,
  'Without a story no history write is needed');
const gallery = read('src/components/yatstats/NewsGallery.tsx');
const reader = read('src/components/yatstats/ProfileNewsList.tsx');
const strip = read('src/components/yatstats/shell/InteractionStrip.tsx');
const mirror = read('src/components/yatstats/Row3MirrorGuard.tsx');
assert.ok(gallery.includes('const [sharedStoryId, setSharedStoryId]'),'Shared story is dismissible');
assert.ok(gallery.includes("setSharedStoryId('')"),'Row 3 removes pinned story');
assert.ok(gallery.includes('dismissSchoolNewsStoryParam(window.location.href)'),'Row 3 consumes deep-link query');
const onFilter=gallery.slice(gallery.indexOf('const onFilter = (event: Event) => {',gallery.indexOf('const releaseSharedStory')),gallery.indexOf('window.addEventListener(NEWS_PLAYER_FILTER_EVENT'));
assert.ok(onFilter.includes('releaseSharedStory()') && onFilter.includes('setPlayerFilter('),'Row 3 changes selected player and dismisses old story');
assert.ok(gallery.includes('const sharedPost = sharedStoryId ?'),'Pin only while link is active');
assert.ok(gallery.includes('const missingLinkedStory = Boolean(sharedStoryId'),'Pagination honors dismissed link');
assert.ok(gallery.includes('const clearFilter = useCallback(() => {\n    releaseSharedStory();'),'Show All clears deep-link state');
assert.ok(reader.includes('const openedStoryParam = useRef<string | null>(null)'),'Initial shared story is one-time');
assert.ok(reader.includes('openedStoryParam.current !== storyParam'),'Changes to story list cannot reopen old article');
assert.ok(reader.includes('openedStoryParam.current = storyParam'),'Deep-link open is remembered');
assert.ok(reader.includes('const onRow3Filter = () => setOpenUuid("")'),'Row 3 closes stale News viewer');
assert.ok(reader.includes('window.addEventListener("yat:news-player-filter", onRow3Filter)'),'News reader listens for Row 3');
assert.ok(strip.includes("if (activeSection === 'news')") && strip.includes("yat:news-player-filter"),'React headshots keep filtering');
assert.ok(mirror.includes("if (sectionKey === 'news')") && mirror.includes("yat:news-player-filter"),'Synthetic headshots keep filtering');
console.log('PASS Row 3 player filters beat shared-story links, clear the previous viewer, and retain all school URLs');
