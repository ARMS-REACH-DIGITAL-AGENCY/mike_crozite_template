import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ASSET_PATHS, currentGazetteBanner, GAZETTE_BANNER_ART_VERSION, gazetteBannerPicture, loadAssets, seriesRecord, dailyBoardPictures } from './newsletterImages';

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


test('newsletter scoreboard includes Total Runs three-game matchup records; no future or unrelated wins', async () => {
  // Actual missing matchups on the April 19, 2026 Hamilton email (week 4).
  const date = '2026-04-19', season = '2027';
  const game = (game_id: number, stage: string, region: number, series_no: number,
    home_hsid: number, away_hsid: number, winner_hsid: number) => ({
      stage, region, round: 2, series_no, game_no: 1, game_id, week: 4,
      game_end_date: date, status: 'final', home_hsid, away_hsid, winner_hsid,
      home_seed: 1, away_seed: 64, home_runs: 0, away_runs: 1,
    });
  const home = game(1729, 'bracket', 3, 1, 5004, 1926, 1926);
  const chandler = game(3289, 'total_runs', 0, 69, 23, 16857, 16857);
  const legacy = game(3265, 'total_runs', 0, 61, 10849, 15525, 15525);
  const gilbert = game(3325, 'total_runs', 0, 81, 123, 38, 38);
  const future = { ...chandler, game_id: 3290, week: 5, game_no: 2, game_end_date: '2026-04-26', winner_hsid: 23 };
  const unrelated = { ...chandler, game_id: 9998, home_hsid: 999, winner_hsid: 16857 };
  const otherStage = { ...chandler, stage: 'bracket', game_id: 9999 };
  const rows = [home, chandler, legacy, gilbert, future, unrelated, otherStage];
  for (const g of [home, chandler, legacy, gilbert]) {
    assert.equal(seriesRecord(rows, g, g.away_hsid, date), '1-0');
    assert.equal(seriesRecord(rows, g, g.home_hsid, date), '0-1');
    assert.equal(seriesRecord(rows, g, g.away_hsid, '2026-04-18'), '0-0');
  }
  assert.equal(seriesRecord(rows, future, 23, '2026-04-26'), '1-1');
  assert.equal(seriesRecord(rows, future, 16857, '2026-04-26'), '1-1');
  const unfinished = { ...future, status: 'in_progress' };
  assert.equal(seriesRecord([...rows.filter(r => r !== future), unfinished], unfinished, 23, '2026-04-26'), '0-1');
  const tie = { ...future, winner_hsid: null };
  assert.equal(seriesRecord([...rows.filter(r => r !== future), tie], tie, 23, '2026-04-26'), '0-1');
  const scores = [home, chandler, legacy, gilbert].map((g, i) => ({
    ...g, season_key: season, home_label: ['HAMILTON','CHANDLER','LEGACY','GILBERT'][i],
    away_label: ['STILLWATER','CASTEEL','CAMPO VERDE','SARASOTA'][i],
    home_innings: ['0'], away_innings: ['1'],
  }));
  const db = { query: async (sql: string) => ({ rows: sql.includes('daily_game_scores') ? scores :
    sql.includes('school_nearest_schools') ? [23,15525,123].map(neighbor_hsid => ({ home_hsid: 5004, neighbor_hsid })) : rows }) };
  const result = await dailyBoardPictures(db, { date, season, hsids: [5004], assets: { fontCss: '', medallion: '', bannerArt: '' } });
  assert.equal(result.pictures.length, 1);
  const html = result.pictures[0].html;
  assert.equal((html.match(/>\(1-0\)<\/div>/g) || []).length, 4);
  assert.equal((html.match(/>\(0-1\)<\/div>/g) || []).length, 4);
  for (const name of ['CASTEEL','CHANDLER','CAMPO VERDE','LEGACY','SARASOTA','GILBERT']) assert.ok(html.includes(name));
});
