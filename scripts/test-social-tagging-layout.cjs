'use strict';
// Regression: the tagging UI must preserve the original three equal social
// actions and never squash Tag or its search into a one-quarter-width dropdown.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const tag=read('src/components/yatstats/PlayerTagging.tsx');
const feed=read('src/components/yatstats/StoriesFeed.tsx');
const viewer=read('src/components/yatstats/StoryViewer.tsx');
const retired=read('src/components/yatstats/WhereYatReactions.tsx');
const retiredStyles=read('src/components/yatstats/WhereYatProfilePanel.tsx');
assert.match(tag,/\.ypt-wrap\{display:contents\}/,'Tag wrapper must not distort the three main action buttons');
assert.match(tag,/\.ypt-wrap>button\{grid-column:1\/-1;justify-self:end/,'Tag trigger gets a separate row, right aligned');
assert.match(tag,/\.ypt-panel\{[^}]*grid-column:1\/-1/,'Tag panel spans full toolbar below the separate Tag trigger');
assert.match(tag,/\.ypt-panel\{[^}]*width:100%/,'Tag panel is full width');
assert.match(tag,/\.ypt-panel \.ycs \.yat-gs-input-wrap input\.yat-gs-input\{[^}]*width:100%/,'Player search uses full panel width');
assert.match(tag,/\.ypt-panel \.ycs \.yat-search-mode-buttons\{[^}]*width:100%/,'Picker search modes use full panel width');
for(const [name,source] of [['story card',feed],['story viewer',viewer],['retired card',retiredStyles]]){
  assert.match(source,/grid-template-columns:repeat\(3,\s*minmax\(0,\s*1fr\)\)|grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,name+' preserves the original three-button bar');
}
assert.match(feed,/<PlayerTagging/, 'Story card has Tag action');
assert.match(viewer,/<PlayerTagging/, 'Story modal has Tag action');
assert.match(retired,/<PlayerTagging/, 'Where YAT Now includes Tag action');
assert.match(tag,/ContributeSearch onPlayer/, 'Global player search remains functional');
assert.match(tag,/onClick=\{\(\)=>void mutate\('untag',p\.playerId\)\}/, 'Existing tags remain removable');
for(const [name,route] of [['Stories',read('src/app/api/stories/[id]/tags/route.ts')],['Where YAT Now',read('src/app/api/contribute/where-yat-now/tags/route.ts')]]) {
  assert.ok(route.includes('YAT[0-9]{6,}'),name+' accepts canonical YAT IDs');
  assert.ok(route.includes('yatid=public.yat_id_for'),name+' resolves registry identities');
  assert.ok(route.includes('NOT EXISTS(SELECT 1 FROM'),name+' avoids adding an existing person under another ID');
  assert.ok(route.includes('primary_id'),name+' protects the original player against alias self-tags');
}
assert.ok(tag.includes('body.light-theme .ypt-panel'),'Tag panel follows light mode');
assert.ok(tag.includes('color:var(--ypt-fg)!important'),'Search results use the panel text color');
assert.ok(tag.includes('Saving tags…'),'Tag mutation shows visible progress');
const retiredMemory=read('src/components/yatstats/WhereYatMemory.tsx');
assert.ok(feed.includes('show(s, 0, true)'),'Stories comment action opens the photo viewer');
assert.ok(retiredMemory.includes('onOpenComment={()=>openViewer(true)}'),'Retired comment action opens the same photo viewer');
assert.doesNotMatch(viewer,/ysv-comment-mode/,'Comment never switches to a photo-hiding layout');
assert.ok(viewer.includes('grid-template-rows: minmax(0, 42dvh) minmax(0, 1fr)'),'Mobile viewer keeps photo and discussion rows');
assert.ok(viewer.includes('min-height:min(112px,28dvh);max-height:min(220px,40dvh)'),'Mobile composer is taller with viewport-aware limits');
assert.ok(viewer.includes('useCommentComposerHeight(composerRef, draft, Boolean(me))'),'Regular stories grow their comment composer');
assert.ok(retired.includes('useCommentComposerHeight(composerRef,draft,composerOpen&&Boolean(me))'),'Retired memories use the same auto-growing composer');
console.log('PASS: original three equal social buttons restored; Tag gets separate right-aligned row, picker full card width, player search and existing tags preserved.');
