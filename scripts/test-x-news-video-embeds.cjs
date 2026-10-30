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
assert.match(widget, /platform\\.twitter\\.com\\/widgets\\.js/);
assert.match(widget, /createTweet/);
assert.match(widget, /Watch original video on X/);
assert.match(widget, /setTimeout/);
assert.match(reader, /<XPostEmbed/);
assert.match(reader, /selectedVideo\\?\\.provider === "X"/);
assert.match(reader, /selectedVideo\\.provider !== "X"/);
assert.match(reader, /<NewsEngagement/);

console.log("PASS: X video/status URL validation, official inline widget, blocked-embed fallback and News interactions");
