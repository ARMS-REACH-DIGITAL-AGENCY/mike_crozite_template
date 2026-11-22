'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function compile(file, context) {
  const exports = {};
  const js = ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
  } }).outputText;
  vm.runInNewContext(js, { exports, ...context }, { filename: file });
  return exports;
}
const settle = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  const events = [], doc = new EventTarget(), win = new EventTarget();
  doc.visibilityState = 'visible';
  let active = false, observerCallback, disconnected = false;
  const panel = { classList: { contains: () => active } };
  const { watchVisibleNews } = compile('src/lib/visibleNewsRefresh.ts', {
    document: doc, window: win,
    MutationObserver: class {
      constructor(callback) { observerCallback = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    },
  });
  const stop = watchVisibleNews(panel, 'visible', value => events.push(value));
  assert.deepEqual(events, [], 'An unopened panel must not request news');
  active = true; observerCallback(); observerCallback();
  assert.deepEqual(events, [true], 'One refresh per visibility transition');
  win.dispatchEvent(new Event('focus'));
  assert.deepEqual(events, [true, true], 'Returning focus to visible News refreshes it');
  active = false; observerCallback();
  win.dispatchEvent(new Event('focus'));
  assert.deepEqual(events, [true, true, false], 'No requests while another tab is open');
  doc.visibilityState = 'hidden'; active = true; observerCallback();
  assert.deepEqual(events, [true, true, false], 'Background pages remain idle');
  doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(events, [true, true, false, true]);
  stop(); assert(disconnected);
  win.dispatchEvent(new Event('focus'));
  assert.equal(events.length, 4, 'Unmount removes all subscriptions');

  // Run the actual profile wrapper's fetch/merge/pagination logic.
  let callback, cursor = 0, pending = [], output;
  const hooks = [], effects = [], requests = [];
  const react = {
    createElement: (type, props) => ({ type, props }),
    useState(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = initial;
      return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }];
    },
    useEffect(effect, deps) {
      const i = cursor++, previous = effects[i];
      if (!previous || deps.some((value, j) => !Object.is(value, previous.deps[j]))) {
        pending.push(() => { previous?.cleanup?.(); effects[i] = { deps, cleanup: effect() }; });
      }
    },
  };
  const wrapper = compile('src/components/yatstats/RefreshingProfileNews.tsx', {
    console, React: react, AbortController,
    document: { getElementById: () => panel },
    fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })),
    require(name) {
      if (name === 'react') return react;
      if (name === './ProfileNewsList') return { default: 'NewsList' };
      if (name === '@/lib/visibleNewsRefresh') return { watchVisibleNews: (el, cls, fn) => { callback = fn; return () => {}; } };
      throw Error(`Unexpected import ${name}`);
    },
  }).default;
  const apiStory = id => ({ uuid: `event:${id}`, title: `Player One event ${id}`,
    url: 'https://www.mlb.com/transactions/2026/11/22', publishedAt: '2026-11-22T00:00:00Z',
    summary: `Player One event ${id}`, displayRecap: `Player One event ${id}` });
  const props = { stories: Array.from({ length: 40 }, (_, i) => ({ ...apiStory(i + 100) })),
    firstName: 'Player', playerName: 'Player One', playerId: '100', photoId: 'YAT000100', hsid: '12546' };
  function render() {
    cursor = 0; pending = []; output = wrapper(props); pending.forEach(run => run()); return output;
  }
  render();
  assert.equal(requests.length, 0, 'Cached server history renders without an additional page-load query');
  callback(true); callback(true);
  assert.equal(requests.length, 1, 'Concurrent focus/visibility events share the active refresh');
  assert.match(requests[0].url, /player=YAT000100&view=profile&sort=newest&fresh=1&limit=100&offset=0$/);
  assert.equal(requests[0].options.cache, 'no-store');
  requests[0].resolve({ ok: true, json: async () => ({ posts: Array.from({ length: 100 }, (_, i) => apiStory(i)) }) });
  await settle(); output = render();
  assert.equal(output.props.stories.length, 140, 'New first-page cards merge with all cached older history during refresh');
  assert.match(requests[1].url, /offset=100$/);
  requests[1].resolve({ ok: true, json: async () => ({ posts: Array.from({ length: 100 }, (_, i) => apiStory(i + 100)) }) });
  await settle();
  assert.match(requests[2].url, /offset=200$/);
  requests[2].resolve({ ok: true, json: async () => ({ posts: Array.from({ length: 5 }, (_, i) => apiStory(i + 200)) }) });
  await settle(); output = render();
  assert.equal(output.props.stories.length, 205, 'Profile history is never capped at the 100-card API page size');
  assert.equal(new Set(output.props.stories.map(story => story.uuid)).size, 205, 'Pages merge without duplicate cards');
  callback(true); callback(false);
  assert.equal(requests[3].options.signal.aborted, true, 'Closing News cancels its refresh');
  requests[3].resolve({ ok: true, json: async () => ({ posts: [] }) });
  await settle(); output = render();
  assert.equal(output.props.stories.length, 205, 'Aborted results cannot erase existing history');
  callback(true);
  assert.equal(requests.length, 5, 'Reopening News starts a fresh request');
  requests[4].resolve({ ok: true, json: async () => ({ posts: [apiStory(999)] }) });
  await settle(); output = render();
  assert.equal(output.props.stories[0].uuid, 'event:999', 'A newly received transaction appears on the next News visit');

  // The read API preserves complete profile visibility and honors pagination.
  const calls = [];
  const api = compile('src/app/api/news/[hsid]/route.ts', {
    URL, console,
    require(name) {
      if (name === 'next/server') return { NextResponse: { json: (data, options) => ({ data, options }) } };
      if (name === '@/lib/db') return {
        getNewsByPlayer: async (...args) => { calls.push(args); return []; },
        getNewsByHsid: async (...args) => { calls.push(args); return []; },
      };
      if (name === '@/lib/playerPhotoIds') return { getPlayerPhotoIds: async () => new Map() };
      if (name === '@/lib/playerImage') return {};
      if (name === '@/lib/newsVideo') return {};
      throw Error(`Unexpected import ${name}`);
    },
  });
  const request = url => ({ url: 'https://example.test' + url, headers: new Headers() });
  const fresh = await api.GET(request('/api/news/12546?player=YAT000100&view=profile&sort=newest&fresh=1&limit=100&offset=100'),
    { params: Promise.resolve({ hsid: '12546' }) });
  assert.deepEqual(calls[0], ['YAT000100', 100, true, false, 100]);
  assert.equal(fresh.options.headers['Cache-Control'], 'private, no-store', 'Fresh reads bypass browser/CDN stale responses');
  const normal = await api.GET(request('/api/news/12546'), { params: Promise.resolve({ hsid: '12546' }) });
  assert.match(normal.options.headers['Cache-Control'], /s-maxage=15/, 'Ordinary API consumers retain bounded caching');
  const school = read('src/components/yatstats/NewsGallery.tsx');
  assert.match(school, /watchVisibleNews\(section, 'visible'/, 'School news also refreshes on entry/focus');
  assert.match(school, /if \(!requested \|\| firstPageLoading\.current/, 'Closed tabs and overlapping first-page reads cannot drain school history');
  assert.match(school, /generation !== fetchGeneration\.current/, 'Old pagination cannot overwrite a new school refresh');
  assert.match(read('src/app/[hsid]/player/[playerId]/[slug]/page.tsx'), /<RefreshingProfileNews stories=\{newsStories\}/);
  console.log('PASS: visible-only news freshness, full paginated profile history, cancellation, canonical identity and cache bypass');
})().catch(error => { console.error(error); process.exitCode = 1; });
