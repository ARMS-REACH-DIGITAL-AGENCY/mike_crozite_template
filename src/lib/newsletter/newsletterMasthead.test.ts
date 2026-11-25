import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ASSET_PATHS, currentGazetteBanner, GAZETTE_BANNER_ART_VERSION, gazetteBannerPicture, loadAssets } from './newsletterImages';

test('the approved masthead is bundled and is a JPEG, not an HTTP error page', async () => {
  const assets = await loadAssets(p => readFile(path.join(process.cwd(), 'public', p)));
  assert.match(assets.bannerArt, /^data:image\/jpeg;base64,\/9j\//);
  await assert.rejects(loadAssets(async p => p === ASSET_PATHS.bannerArt
    ? Buffer.from('<html>Sign in to Vercel</html>') : Buffer.from('fixture')), /Invalid Gazette masthead JPEG/);
  await assert.rejects(loadAssets(async () => Buffer.alloc(0)), /Invalid Gazette masthead JPEG/);
  const picture = gazetteBannerPicture(5004, null, assets);
  assert.match(picture.html, /data-required-art="Gazette masthead"/);
  assert.equal(picture.width, 1200);
  assert.equal(picture.height, 279);
});

test('a broken required masthead blocks capture, while absent optional artwork is not required', async () => {
  const picture = gazetteBannerPicture(5004, null, { fontCss: '', medallion: '', bannerArt: 'broken' });
  const script = picture.html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const run = async (broken: boolean) => {
    const window: { __ready?: boolean; __newsletterImageError?: string } = {};
    const img = { decode: async () => { if (broken) throw new Error('decode failed'); },
      naturalWidth: broken ? 0 : 1200, naturalHeight: broken ? 0 : 279,
      hasAttribute: (n: string) => n === 'data-required-art',
      getAttribute: () => 'Gazette masthead' };
    const optional = { ...img, decode: async () => { throw new Error('missing optional logo'); }, hasAttribute: () => false };
    await vm.runInNewContext(script, { window, document: { fonts: { ready: Promise.resolve() }, images: [img, optional], querySelectorAll: () => [] } });
    assert.equal(window.__ready, true);
    return window.__newsletterImageError;
  };
  assert.equal(await run(true), 'Gazette masthead');
  assert.equal(await run(false), '');
});

test('unversioned banners from the defective renderer are not accepted as current', () => {
  assert.equal(currentGazetteBanner(undefined), false);
  assert.equal(currentGazetteBanner({ 'gazette-render-version': 'old' }), false);
  assert.equal(currentGazetteBanner({ 'gazette-render-version': GAZETTE_BANNER_ART_VERSION }), true);
});
