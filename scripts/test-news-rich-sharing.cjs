// Contract tests for short, photo-rich YAT?STATS News shares.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const box={exports:{}};
vm.runInNewContext(ts.transpileModule(read('src/lib/newsShare.ts'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}
}).outputText,{exports:box.exports,Number,String,RegExp});
const {newsShareUrl,newsShareMessage,isNewsArticleId}=box.exports;
const uuid='8f1030d8e87c97b64e12883536e5d13c';
assert.equal(newsShareUrl(39345,uuid),'https://yatstats.com/n/39345');
assert.equal(newsShareUrl('39345',uuid),'https://yatstats.com/n/39345');
assert.equal(newsShareUrl(null,uuid),'https://yatstats.com/n/'+uuid,'Legacy shared UUID links still work');
assert.equal(newsShareUrl(0,uuid),'https://yatstats.com/n/'+uuid);
assert.equal(newsShareUrl(null,'../../bad'),null);
assert.equal(isNewsArticleId('99999999999'),false);
assert.match(newsShareMessage('Trevor Bauer says he met the commissioner',true),/WATCH THE VIDEO on YAT\?STATS/);
assert.match(newsShareMessage('A new college commitment',false),/READ THE STORY on YAT\?STATS/);
const engagement=read('src/components/yatstats/NewsEngagement.tsx');
assert.match(engagement,/newsShareUrl\(articleId,uuid\)/);
assert.match(engagement,/navigator\.share\(\{title:title\+'\s*\|\s*YAT\?STATS',text,url:link\}\)/);
assert.match(engagement,/navigator\.clipboard\.writeText\(text\+'\\n'\+link\)/);
assert.doesNotMatch(engagement,/const shareNews=async\(\)=>\{\s*if\(!me/,
 'Sharing must not require sign-in');
const reader=read('src/components/yatstats/ProfileNewsList.tsx');
const gallery=read('src/components/yatstats/NewsGallery.tsx');
const profile=read('src/app/[hsid]/player/[playerId]/[slug]/page.tsx');
const landing=read('src/app/n/[uuid]/page.tsx');
const og=read('src/app/api/og/news/route.tsx');
assert.match(reader,/articleId=\{story\?\.articleId\}/);
assert.match(reader,/articleId=\{openStory.articleId\}/);
assert.match(gallery,/articleId: post\.id \?\? null/);
assert.match(profile,/articleId: Number\.isSafeInteger\(Number\(row\.id\)\)/);
assert.match(landing,/const condition = byId \? 'id=\$1' : 'uuid=\$1'/);
assert.match(landing,/schoolNewsStoryUrl\(schoolUrls\.get\(item\.hsid\),item\.uuid\)/);
assert.match(landing,/https:\/\/yatstats\.com\/api\/og\/news\?hsid=/);
assert.match(landing,/summary_large_image/);
assert.match(landing,/siteName:'YAT\?STATS'/);
assert.match(og,/WATCH THE VIDEO/);
assert.match(og,/READ THE STORY/);
assert.match(og,/news\.display_image_url,news\.image_url,video\?\.thumbnailUrl/);
assert.match(og,/new ImageResponse/);
assert.match(og,/width: 1200, height: 630/);
console.log('PASS: SMS short News links, active school redirect, RCS image/CTA, and anonymous sharing');
