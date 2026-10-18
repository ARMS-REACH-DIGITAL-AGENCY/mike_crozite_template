// Run with: node scripts/test-player-headshots.cjs
// Exercise image loading transitions without a database, S3, or a browser dependency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relativePath, dependencies = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  const exported = {};
  vm.runInNewContext(compiled, {
    exports: exported,
    require: name => dependencies[name] || require(name),
  }, { filename });
  return exported;
}

const urls = load('src/lib/playerImage.ts');
const { syncPlayerHeadshot } = load('src/lib/playerHeadshotFallback.ts', { './playerImage': urls });
const base = 'https://yatstats-assets.s3.us-west-2.amazonaws.com/players';
const cutout = id => `${base}/now-cutouts/${id}.png`;
const thumbnail = id => `${base}/now-thumb/${id}.webp`;
const original = id => `${base}/now/${id}.jpg`;
const originalPng = id => `${base}/now/${id}.png`;
const silhouette = '/img/headshot-silhouette.png';

// Setting src starts a load. A settled older request may still deliver an
// error, but cannot alter the current request's complete/naturalWidth flags.
class ImageFixture {
  constructor(src) {
    this.attributes = new Map();
    this.dataset = {};
    this.style = { visibility: '' };
    this.requests = [];
    this.complete = false;
    this.naturalWidth = 0;
    this.onerror = null;
    if (src) this.setAttribute('src', src);
  }
  getAttribute(name) { return this.attributes.get(name) || null; }
  setAttribute(name, value) {
    this.attributes.set(name, value);
    if (name === 'src') {
      this.complete = false;
      this.naturalWidth = 0;
      this.requests.push(value);
    }
  }
  settle(src, success) {
    if (this.getAttribute('src') === src) {
      this.complete = true;
      this.naturalWidth = success ? 100 : 0;
    }
    if (!success) this.onerror?.();
  }
}

let passed = 0;
function check(name, run) {
  run();
  passed++;
  console.log(`PASS: ${name}`);
}

check('Same-player current images stay ordered and duplicate shell/card defaults do not reset them', () => {
  const expected = [cutout('100'), thumbnail('100'), original('100'), originalPng('100'), silhouette];
  for (const supplied of [null, original('100'), originalPng('100'), thumbnail('100'), 'null', 'undefined', silhouette]) {
    assert.deepEqual(Array.from(urls.getPlayerHeadshotSources('100', supplied)), expected);
  }
  const designated = 'https://photos.example/designated-100.jpg';
  assert.deepEqual(Array.from(urls.getPlayerHeadshotSources('100', designated)), [designated, ...expected]);
  assert.deepEqual(Array.from(urls.getPlayerHeadshotSources('', silhouette)), [silhouette]);
});

check('An existing successful headshot is not replaced or downloaded again', () => {
  const image = new ImageFixture(cutout('195957'));
  image.settle(cutout('195957'), true);
  for (let n = 0; n < 100; n++) syncPlayerHeadshot(image, '195957');
  assert.deepEqual(image.requests, [cutout('195957')]);
  assert.equal(image.naturalWidth, 100);
  assert.equal(image.style.visibility, '');
});

check('Pre-hydration failure reaches the original JPG without skipping a loading fallback', () => {
  const image = new ImageFixture(cutout('200001'));
  image.settle(cutout('200001'), false);
  syncPlayerHeadshot(image, '200001', original('200001'));
  syncPlayerHeadshot(image, '200001', thumbnail('200001'));
  assert.deepEqual(image.requests, [cutout('200001'), thumbnail('200001')]);
  image.settle(thumbnail('200001'), false);
  image.settle(original('200001'), true);
  for (let n = 0; n < 100; n++) syncPlayerHeadshot(image, '200001');
  assert.deepEqual(image.requests, [cutout('200001'), thumbnail('200001'), original('200001')]);
  assert.equal(image.getAttribute('src'), original('200001'));
  // React can reapply its initial src; the mirror must retain the successful JPG.
  image.setAttribute('src', cutout('200001'));
  syncPlayerHeadshot(image, '200001');
  assert.equal(image.getAttribute('src'), original('200001'));
});

check('An available designated headshot is used before generic derivative copies', () => {
  const image = new ImageFixture(cutout('200002'));
  const designated = 'https://photos.example/designated-200002.jpg';
  syncPlayerHeadshot(image, '200002', designated);
  image.settle(cutout('200002'), false);
  image.settle(designated, true);
  for (let n = 0; n < 100; n++) syncPlayerHeadshot(image, '200002', designated);
  assert.deepEqual(image.requests, [cutout('200002'), designated]);
});

check('Missing headshots end on a stable silhouette with no repeated requests', () => {
  const image = new ImageFixture(cutout('200003'));
  syncPlayerHeadshot(image, '200003');
  for (const src of [cutout('200003'), thumbnail('200003'), original('200003'), originalPng('200003')]) image.settle(src, false);
  image.settle(silhouette, true);
  for (let n = 0; n < 100; n++) syncPlayerHeadshot(image, '200003');
  assert.deepEqual(image.requests, [cutout('200003'), thumbnail('200003'), original('200003'), originalPng('200003'), silhouette]);
  assert.equal(image.dataset.silhouetteFallback, 'true');
  assert.equal(image.style.visibility, '');
});

check('Even a failed local placeholder stops cleanly without a broken image or retry loop', () => {
  const image = new ImageFixture(cutout('200004'));
  syncPlayerHeadshot(image, '200004');
  for (const src of [cutout('200004'), thumbnail('200004'), original('200004'), originalPng('200004'), silhouette]) image.settle(src, false);
  for (let n = 0; n < 100; n++) syncPlayerHeadshot(image, '200004');
  assert.equal(image.requests.length, 5);
  assert.equal(image.style.visibility, 'hidden');
  syncPlayerHeadshot(image, '200005');
  assert.equal(image.style.visibility, '');
  assert.equal(image.getAttribute('src'), cutout('200005'));
});

check('A recycled element ignores stale errors while the new player loads or after success', () => {
  const image = new ImageFixture(cutout('200006'));
  syncPlayerHeadshot(image, '200006');
  const obsoleteHandler = image.onerror;
  syncPlayerHeadshot(image, '200007');
  image.settle(cutout('200006'), false);
  obsoleteHandler();
  assert.equal(image.getAttribute('src'), cutout('200007'));
  assert.equal(image.complete, false);
  image.settle(cutout('200007'), true);
  image.settle(cutout('200006'), false);
  assert.equal(image.getAttribute('src'), cutout('200007'));
  assert.equal(image.naturalWidth, 100);
  assert.deepEqual(image.requests, [cutout('200006'), cutout('200007')]);
});

check('Changing a designated source discards the previous source list and old handler', () => {
  const oldPhoto = 'https://photos.example/old.jpg';
  const newPhoto = 'https://photos.example/new.jpg';
  const image = new ImageFixture(cutout('200008'));
  syncPlayerHeadshot(image, '200008', oldPhoto);
  image.settle(cutout('200008'), false);
  const obsoleteHandler = image.onerror;
  syncPlayerHeadshot(image, '200008', newPhoto);
  obsoleteHandler();
  image.settle(cutout('200008'), false);
  assert.equal(image.getAttribute('src'), newPhoto);
  image.settle(newPhoto, true);
  image.settle(oldPhoto, false);
  assert.equal(image.getAttribute('src'), newPhoto);
});

check('Verified official MLB and MiLB images fill missing stored photos without replacing contributions', () => {
  const official = urls.getMlbHeadshotUrl('571510');
  const alternate = urls.getMlbHeadshotUrl('571510', 'milb');
  const image = new ImageFixture(cutout('157347'));
  syncPlayerHeadshot(image, '157347', official);
  for (const src of [cutout('157347'), thumbnail('157347'), original('157347'), originalPng('157347'), official]) image.settle(src, false);
  assert.equal(image.getAttribute('src'), alternate);
  image.settle(alternate, true);
  syncPlayerHeadshot(image, '157347', official);
  assert.equal(image.getAttribute('src'), alternate);
  const contributed = 'https://photos.example/approved-contribution.jpg';
  assert.equal(urls.getPlayerHeadshotSources('157347', contributed)[0], contributed);
  assert.equal(urls.getMlbHeadshotUrl('Matthew Boyd'), '');
  assert.equal(urls.getMlbHeadshotUrl('../571510'), '');
});

console.log(`${passed} player-headshot checks passed.`);
