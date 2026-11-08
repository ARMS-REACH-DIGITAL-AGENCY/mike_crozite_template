const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const vm = require("node:vm");

const parser = fs.readFileSync(path.join(__dirname, "../src/lib/newsVideo.ts"), "utf8");
const js = ts.transpileModule(parser, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText;
const out = { exports: {} };
vm.runInNewContext(js, { exports: out.exports, URL, console }, { filename: "newsVideo.js" });
const { getXPostId, parseNewsVideo } = out.exports;

const id = "1219276646382895109";
const liveId = "2118538485447672210";
assert.equal(getXPostId(`https://x.com/PrepBaseballNV/status/${liveId}?a=6Zlj3az35CRIsQFFBmg&s=09`), liveId);
assert.equal(parseNewsVideo(`https://x.com/PrepBaseballNV/status/${liveId}?s=09`)?.provider, "X");
assert.equal(parseNewsVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.provider, "YouTube");
assert.equal(parseNewsVideo("https://www.instagram.com/reel/Cx123Ab2/")?.provider, "Instagram");

const mlbClip = "https://www.mlb.com/rays/video/casey-legumina-s-tribute-tattoo?partnerId=web_video-playback-page_video-share";
const parsedMlb = parseNewsVideo(mlbClip);
assert.equal(parsedMlb?.provider, "MLB");
assert.equal(parsedMlb?.watchUrl, mlbClip);
assert.equal(parsedMlb?.embedUrl, "https://www.mlb.com/unified-player/embed/casey-legumina-s-tribute-tattoo");
assert.equal(parseNewsVideo("https://www.mlb.com/video/casey-legumina-s-tribute-tattoo")?.provider, "MLB");
for (const badUrl of [
  "https://mlb.com.evil.example/rays/video/casey-legumina-s-tribute-tattoo",
  "http://www.mlb.com/rays/video/casey-legumina-s-tribute-tattoo",
  "https://www.mlb.com/rays/news/casey-legumina-s-tribute-tattoo",
  "https://www.mlb.com/rays/video/casey-legumina-s-tribute-tattoo/extra",
  "https://www.mlb.com@evil.example/rays/video/casey-legumina-s-tribute-tattoo",
]) {
  assert.equal(parseNewsVideo(badUrl), null, `invalid MLB URL: ${badUrl}`);
}

const valid = [
  `https://x.com/Ben13Porter/status/${id}/video/1`,
  `https://x.com/Ben13Porter/status/${id}`,
  `https://www.x.com/Ben13Porter/status/${id}?s=20`,
  `https://twitter.com/Ben13Porter/status/${id}/video/1`,
  `https://mobile.twitter.com/Ben13Porter/status/${id}`,
  `https://mobile.x.com/Ben13Porter/status/${id}`,
];
for (const url of valid) {
  assert.equal(getXPostId(url), id, `expected status ID: ${url}`);
  const video = parseNewsVideo(url);
  assert.equal(video?.provider, "X", `expected X provider: ${url}`);
  assert.equal(video?.embedUrl, null, "X must not be embedded via raw x.com iframe");
}

for (const url of [
  "http://x.com/Ben13Porter/status/1219276646382895109",
  "https://x.com@evil.example/Ben13Porter/status/1219276646382895109",
  "https://evil.example/Ben13Porter/status/1219276646382895109",
  "https://x.com/Ben13Porter/profile/1219276646382895109",
  "https://x.com/Ben13Porter/status/unsafe",
  "https://x.com/Ben13Porter/status/1219276646382895109.evil",
  "https://x.com/Ben13Porter/status/1219276646382895109/other",
]) {
  assert.equal(getXPostId(url), null, `invalid X URL should not embed: ${url}`);
}
assert.equal(parseNewsVideo("https://x.com/Ben13Porter/status/unsafe"), null);

const widget = fs.readFileSync(path.join(__dirname, "../src/components/yatstats/XPostEmbed.tsx"), "utf8");
const reader = fs.readFileSync(path.join(__dirname, "../src/components/yatstats/ProfileNewsList.tsx"), "utf8");
assert.ok(widget.includes("platform.x.com/widgets.js"));
assert.match(widget, /createTweet/);
assert.match(widget, /Watch original video on X/);
assert.match(widget, /setTimeout/);
assert.match(reader, /<XPostEmbed/);
assert.match(reader, /PLAY MLB VIDEO/);
assert.match(reader, /WATCH ON MLB.COM IF PLAYER DOES NOT LOAD/);
assert.ok(reader.includes('selectedVideo?.provider === "X"'));
assert.ok(reader.includes('selectedVideo.provider !== "X"'));
assert.match(reader, /<NewsEngagement/);

console.log("PASS: X video/status URL validation, official inline widget, blocked-embed fallback and News interactions");
