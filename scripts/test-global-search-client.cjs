'use strict';

// Runs the real client effect and row renderer in an isolated VM. No React
// internals, network, browser session, or repository files are modified.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repo = path.resolve(__dirname, '..');
const ts = require('typescript');
const { createHash } = require('node:crypto');
const sourcePath = path.join(repo, 'src/components/yatstats/SearchDrawerTabs.tsx');

class TestEvent {
  constructor(type, init = {}) { this.type = type; this.bubbles = init.bubbles !== false; Object.assign(this, init); }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.propagationStopped = true; }
  stopImmediatePropagation() { this.immediateStopped = true; this.propagationStopped = true; }
}
class TestKeyboardEvent extends TestEvent {}
class TestCustomEvent extends TestEvent {}
class TestEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback, options = false) {
    const capture = typeof options === 'boolean' ? options : Boolean(options.capture);
    const listeners = this.listeners.get(type) || [];
    if (!listeners.some(item => item.callback === callback && item.capture === capture)) listeners.push({ callback, capture });
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, callback, options = false) {
    const capture = typeof options === 'boolean' ? options : Boolean(options.capture);
    this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item.callback !== callback || item.capture !== capture));
  }
  invoke(event, capture) {
    event.currentTarget = this;
    for (const item of [...(this.listeners.get(event.type) || [])]) {
      if (item.capture !== capture) continue;
      item.callback.call(this, event);
      if (event.immediateStopped) break;
    }
  }
  dispatchEvent(event) {
    event.target ||= this;
    const chain = [];
    for (let current = this; current; current = current.parentElement) chain.push(current);
    for (const current of [...chain].reverse()) {
      current.invoke(event, true);
      if (event.propagationStopped) return !event.defaultPrevented;
    }
    for (const current of chain) {
      current.invoke(event, false);
      if (event.propagationStopped || !event.bubbles) break;
    }
    return !event.defaultPrevented;
  }
  listenerCount() { return [...this.listeners.values()].reduce((sum, list) => sum + list.length, 0); }
}
const dataKey = name => name.replace(/^data-/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
class TestElement extends TestEventTarget {
  constructor(tag = 'div') {
    super(); this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null;
    this.dataset = {}; this.attributes = new Map(); this.style = {}; this._className = ''; this.id = '';
    this._innerHTML = ''; this._textContent = ''; this.htmlWrites = []; this.value = ''; this.hidden = false;
    this.classList = {
      contains: value => this._className.split(/\s+/).includes(value),
      add: (...values) => { this._className = [...new Set([...this._className.split(/\s+/).filter(Boolean), ...values])].join(' '); },
      remove: (...values) => { this._className = this._className.split(/\s+/).filter(value => !values.includes(value)).join(' '); },
      toggle: (value, force) => { const next = force ?? !this.classList.contains(value); this.classList[next ? 'add' : 'remove'](value); return next; },
    };
  }
  get className() { return this._className; }
  set className(value) { this._className = value; }
  get parentNode() { return this.parentElement; }
  get nextSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] || null; }
  get nextElementSibling() { return this.nextSibling; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); if (name === 'class') this.className = String(value); if (name.startsWith('data-')) this.dataset[dataKey(name)] = String(value); }
  getAttribute(name) { if (name === 'id') return this.id || null; if (name === 'class') return this.className || null; if (name.startsWith('data-')) return this.dataset[dataKey(name)] ?? null; return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  removeAttribute(name) { this.attributes.delete(name); if (name.startsWith('data-')) delete this.dataset[dataKey(name)]; }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) {
    this._innerHTML = String(value); this._textContent = ''; this.htmlWrites.push(this._innerHTML);
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    // The effect only queries buttons created by its mode-tab HTML. Result
    // strings are asserted directly; unauthenticated favorite hydration is idle.
    for (const match of this._innerHTML.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
      const child = new TestElement('button');
      for (const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) child.setAttribute(attr[1], attr[2]);
      child.textContent = match[2].replace(/<[^>]+>/g, ''); this.appendChild(child);
    }
  }
  get textContent() { return this._textContent || this._innerHTML.replace(/<[^>]*>/g, '') || this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._textContent = String(value); this._innerHTML = ''; this.children = []; }
  appendChild(child) { child.remove(); this.children.push(child); child.parentElement = this; return child; }
  append(...children) { for (const child of children) this.appendChild(child); }
  insertBefore(child, reference) { child.remove(); const index = reference ? this.children.indexOf(reference) : this.children.length; this.children.splice(index < 0 ? this.children.length : index, 0, child); child.parentElement = this; return child; }
  insertAdjacentElement(position, child) {
    if (position === 'beforebegin') this.parentElement?.insertBefore(child, this);
    else if (position === 'afterend') this.parentElement?.insertBefore(child, this.nextSibling);
    else if (position === 'afterbegin') this.insertBefore(child, this.children[0]);
    else this.appendChild(child);
    return child;
  }
  before(child) { this.parentElement?.insertBefore(child, this); }
  after(child) { this.parentElement?.insertBefore(child, this.nextSibling); }
  remove() { if (this.parentElement) { const index = this.parentElement.children.indexOf(this); if (index >= 0) this.parentElement.children.splice(index, 1); this.parentElement = null; } }
  matches(selector) {
    if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
    const attrs = [...selector.matchAll(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g)];
    const bare = selector.replace(/\[[^\]]+\]/g, '');
    const id = bare.match(/#([\w-]+)/)?.[1]; if (id && this.id !== id) return false;
    const tag = bare.match(/^[a-z][\w-]*/i)?.[0]; if (tag && this.tagName !== tag.toUpperCase()) return false;
    for (const match of bare.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(match[1])) return false;
    for (const [, name, value] of attrs) { if (!this.hasAttribute(name)) return false; if (value !== undefined && this.getAttribute(name) !== value) return false; }
    return true;
  }
  closest(selector) { for (let element = this; element; element = element.parentElement) if (element.matches(selector)) return element; return null; }
  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/);
    const last = parts.pop();
    const found = [];
    const visit = element => {
      for (const child of element.children) {
        if (child.matches(last) && (!parts.length || child.parentElement?.closest(parts.join(' ')))) found.push(child);
        visit(child);
      }
    };
    visit(this); return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(element) { return element === this || this.children.some(child => child.contains(element)); }
}

function createEnvironment({ queryString = '', code = fs.readFileSync(sourcePath, 'utf8') } = {}) {
  const body = new TestElement('body');
  const left = body.appendChild(new TestElement('aside')); left.id = 'drawerLeft';
  const drawer = left.appendChild(new TestElement()); drawer.className = 'yat-left-search-content';
  const title = drawer.appendChild(new TestElement()); title.id = 'gsTitle';
  const sub = drawer.appendChild(new TestElement()); sub.className = 'yat-search-drawer-sub';
  const inputWrap = drawer.appendChild(new TestElement()); inputWrap.className = 'yat-gs-input-wrap';
  const input = inputWrap.appendChild(new TestElement('input')); input.id = 'gsInput';
  const results = drawer.appendChild(new TestElement()); results.id = 'gsResults';
  const document = new TestEventTarget();
  Object.assign(document, {
    body, createElement: tag => new TestElement(tag),
    getElementById: id => body.id === id ? body : body.querySelector('#' + id),
    querySelector: selector => body.querySelector(selector),
    querySelectorAll: selector => body.querySelectorAll(selector),
  });
  const window = new TestEventTarget();
  let now = 100000;
  let nextTimer = 0;
  const timers = new Map();
  const timerHistory = [];
  const setTimeout = (callback, delay = 0, ...args) => { const id = ++nextTimer; const ms = Math.max(0, Number(delay) || 0); timers.set(id, { at: now + ms, callback, args }); timerHistory.push({ id, delay: ms }); return id; };
  const clearTimeout = id => timers.delete(id);
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  Object.assign(window, { document, location: { search: queryString, href: 'https://example.test/' + queryString, pathname: '/' }, setTimeout, clearTimeout });
  const requests = [];
  const fetch = (url, init = {}) => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const request = { url: String(url), init, resolve, reject, settled: false };
    request.respond = (data, status = 200) => { request.settled = true; resolve({ ok: status >= 200 && status < 300, status, json: async () => data }); };
    requests.push(request); return promise;
  };
  const effects = [];
  const exports = {};
  const tracks = [];
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  const context = vm.createContext({
    exports, module: { exports }, document, window, fetch, Date: ClockDate,
    Event: TestEvent, KeyboardEvent: TestKeyboardEvent, CustomEvent: TestCustomEvent,
    HTMLElement: TestElement, HTMLInputElement: TestElement, HTMLButtonElement: TestElement,
    AbortController, DOMException, URL, URLSearchParams, setTimeout, clearTimeout,
    localStorage: storage, sessionStorage: storage, console,
    require(name) {
      if (name === 'react') return { useEffect: callback => effects.push(callback) };
      if (name === 'react/jsx-runtime') return { jsx: (...args) => args, jsxs: (...args) => args };
      if (name === '@/lib/analytics') return { track: (...args) => tracks.push(args) };
      throw new Error('Unexpected fixture dependency: ' + name);
    },
  });
  const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInContext(compiled, context, { filename: 'SearchDrawerTabs.actual-source.js' });
  let cleanup;
  const mount = () => { exports.default(); assert.equal(effects.length, 1); cleanup = effects[0](); assert.equal(typeof cleanup, 'function'); };
  const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
  const tick = async ms => {
    const target = now + ms; let count = 0;
    while (true) {
      const next = [...timers.entries()].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      if (++count > 500) throw new Error('Timer recursion in isolated search fixture');
      const [id, task] = next; timers.delete(id); now = task.at; task.callback(...task.args); await flush();
    }
    now = target; await flush();
  };
  const type = value => { input.value = value; input.dispatchEvent(new TestEvent('input')); };
  const emit = type => input.dispatchEvent(type === 'keyup' ? new TestKeyboardEvent(type, { key: 'Enter' }) : new TestEvent(type));
  const clickMode = mode => { const button = drawer.querySelector(`[data-search-mode="${mode}"]`); assert.ok(button, mode + ' mode button exists'); button.dispatchEvent(new TestEvent('click')); };
  const allElements = () => [body, ...body.querySelectorAll('*')];
  const countListeners = () => allElements().reduce((sum, element) => sum + element.listenerCount(), 0) + window.listenerCount() + document.listenerCount();
  const unmount = () => { cleanup?.(); };
  return { exports, context, mount, unmount, tick, flush, type, emit, clickMode, input, results, drawer, body, window, document, requests, timers, timerHistory, tracks, countListeners, now: () => now };
}

const playerData = name => ({ players: [{ playerId: '100', schoolId: '5004', firstName: name, lastName: 'Player', displayName: name + ' Player', schoolName: 'Fixture High' }] });
const schoolData = name => ({ programs: [{ hsid: '5004', hsname: name, hslocation: 'Chandler, AZ', current_aa: 42, microsite_url: 'https://fixture.az.yatstats.com' }] });
const teamData = name => ({ teams: [{ playerId: '100', schoolId: '5004', firstName: 'Team', lastName: 'Player', currentTeamName: name }] });
const checks = [];
function passed(name) { checks.push(name); console.log('PASS ' + name); }


const statusOf = env => env.drawer.querySelector('.yat-search-status');

async function start(env, query) { env.type(query); await env.tick(90); return env.requests.at(-1); }
async function answer(env, request, data, status = 200) { request.respond(data, status); await env.flush(); }

async function invalidationChecks() {
  const env = createEnvironment(); env.mount();
  const status = statusOf(env);
  assert.ok(status, 'A separate status element exists');
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  env.type('Alice');
  await env.tick(89); assert.equal(env.requests.length, 0, 'Typing waits at most the intended 90 ms');
  await env.tick(1); assert.equal(env.requests.length, 1, 'Typing starts the request at 90 ms');
  const alice = env.requests[0];
  assert.ok(alice.init.signal, 'Search fetch receives an abort signal');
  env.type('Bob');
  assert.equal(alice.init.signal.aborted, true, 'Input invalidates and aborts the old request immediately, before debounce');
  await answer(env, alice, playerData('STALE_ALICE'));
  assert.ok(!env.results.innerHTML.includes('STALE_ALICE'), 'A response delivered after invalidation cannot render');
  await env.tick(90);
  await answer(env, env.requests[1], playerData('CURRENT_BOB'));
  assert.ok(env.results.innerHTML.includes('CURRENT_BOB'));
  const bobRows = env.results.innerHTML;
  const bobWriteCount = env.results.htmlWrites.length;
  env.type('Carol');
  assert.equal(env.results.innerHTML, bobRows, 'New typing does not wipe the previous result rows');
  await env.tick(90);
  assert.equal(env.results.innerHTML, bobRows, 'Loading does not replace rows with a loading placeholder');
  assert.equal(env.results.htmlWrites.length, bobWriteCount);
  assert.match(status.textContent, /search/i);
  const carol = env.requests.at(-1);
  env.clickMode('school');
  assert.equal(carol.init.signal.aborted, true, 'A mode switch aborts an active request immediately');
  await answer(env, carol, playerData('STALE_PLAYER_MODE'));
  assert.equal(env.results.innerHTML, bobRows, 'A stale response from the former mode cannot overwrite visible rows');
  await env.tick(90);
  const schools = env.requests.at(-1);
  assert.match(schools.url, /^\/api\/schools\/search\?q=Carol/);
  await answer(env, schools, schoolData('CURRENT_SCHOOL_MODE'));
  assert.ok(env.results.innerHTML.includes('CURRENT_SCHOOL_MODE'));
  assert.ok(!env.results.innerHTML.includes('STALE_PLAYER_MODE'));
  env.unmount();
  passed('90 ms debounce; input and mode changes abort/invalidate immediately; late responses cannot overwrite results; loading uses a separate live status without wiping rows');
}

async function duplicateChecks() {
  const env = createEnvironment(); env.mount();
  env.type(' Exact ');
  env.emit('keyup');
  await env.flush();
  assert.equal(env.requests.length, 1, 'Enter flushes a pending debounce immediately');
  assert.match(env.requests[0].url, /q=Exact(?:&|$)/);
  for (let i = 0; i < 3; i++) { env.emit('search'); env.emit('keyup'); env.type('Exact'); }
  await env.tick(500);
  assert.equal(env.requests.length, 1, 'Repeated native input/search/Enter events do not duplicate an in-flight exact trimmed query');
  await answer(env, env.requests[0], playerData('EXACT_QUERY'));
  const rows = env.results.innerHTML;
  const writes = env.results.htmlWrites.length;
  for (let i = 0; i < 3; i++) { env.emit('search'); env.emit('keyup'); env.type(' Exact '); }
  await env.tick(500);
  assert.equal(env.requests.length, 1, 'A ready exact query does not refetch on duplicate events');
  assert.equal(env.results.innerHTML, rows);
  assert.equal(env.results.htmlWrites.length, writes, 'Ready duplicate events retain the actual row nodes');
  env.type('exact'); env.emit('keyup'); await env.flush();
  assert.equal(env.requests.length, 2, 'Cache/request identity preserves query case');
  await answer(env, env.requests[1], playerData('LOWER_CASE'));
  env.clickMode('school'); await env.tick(90);
  assert.equal(env.requests.length, 3, 'The same query in another mode is a separate request');
  env.unmount();
  passed('Enter flushes once; duplicate input/search/Enter events do not refetch or rerender loading/ready queries; trimmed query plus mode preserves case');
}

async function errorChecks() {
  const env = createEnvironment(); env.mount();
  const request = await start(env, 'Failure');
  await answer(env, request, { error: 'Fixture service error' }, 503);
  assert.match(env.results.innerHTML + statusOf(env).textContent, /fail|unable|error/i, 'An HTTP failure produces an error, not an empty success');
  assert.ok(!env.results.innerHTML.includes('No player matches.'), 'HTTP errors are not disguised as no matches');
  assert.ok(/role=["']alert["']/.test(env.results.innerHTML) || statusOf(env).getAttribute('role') === 'alert', 'The error is an accessible alert');
  env.emit('keyup'); await env.flush();
  assert.equal(env.requests.length, 2, 'Explicit Enter retries a failed exact query');
  await answer(env, env.requests[1], playerData('RECOVERED'));
  assert.ok(env.results.innerHTML.includes('RECOVERED'));
  const direct = env.exports.fetchJson('/fixture-http-error');
  await answer(env, env.requests.at(-1), {}, 503);
  assert.equal(JSON.stringify(await direct), '{}', 'The shared Contribute helper retains its existing contract');
  env.unmount();
  passed('Global Search HTTP failures render an accessible error and allow an explicit Enter retry; the shared Contribute helper stays unchanged');
}

async function cacheChecks() {
  const env = createEnvironment(); env.mount();
  const request = await start(env, 'Cached');
  await answer(env, request, playerData('CACHED_VALUE'));
  const readyAt = env.now();
  env.type(''); env.type('Cached'); await env.tick(90);
  assert.equal(env.requests.length, 1, 'A fresh cached query reuses its response');
  assert.ok(env.results.innerHTML.includes('CACHED_VALUE'));
  await env.tick(readyAt + 29000 - env.now());
  env.type(''); env.type('Cached'); await env.tick(90);
  assert.equal(env.requests.length, 1, 'Cache survives within its 30 second lifetime');
  await env.tick(readyAt + 30001 - env.now());
  env.type(''); env.type('Cached'); await env.tick(90);
  assert.equal(env.requests.length, 2, 'Cache expires after 30 seconds instead of retaining data indefinitely');
  env.unmount();

  const bounded = createEnvironment(); bounded.mount();
  for (let index = 0; index < 25; index++) {
    const query = 'Query' + String(index).padStart(2, '0');
    const next = await start(bounded, query);
    assert.equal(bounded.requests.length, index + 1);
    await answer(bounded, next, playerData(query));
  }
  bounded.type('Query00'); await bounded.tick(90);
  assert.equal(bounded.requests.length, 26, 'Adding a 25th entry evicts the oldest of the 24-entry cache');
  await answer(bounded, bounded.requests.at(-1), playerData('Query00 refreshed'));
  bounded.type('Query24'); await bounded.tick(90);
  assert.equal(bounded.requests.length, 26, 'Recent entries remain cached when the oldest entry is evicted');
  assert.ok(bounded.results.innerHTML.includes('Query24'));
  bounded.unmount();
  passed('The per-effect cache reuses fresh exact queries, expires after 30 seconds, and evicts its oldest entry at a 24-entry capacity');
}

async function cleanupChecks() {
  const delayed = createEnvironment(); delayed.mount();
  assert.ok(delayed.countListeners() >= 8);
  delayed.type('Never send');
  assert.equal(delayed.timers.size, 1);
  delayed.unmount();
  assert.equal(delayed.timers.size, 0, 'Unmount clears a pending debounce');
  assert.equal(delayed.countListeners(), 0, 'Unmount removes mode button, input, result and window listeners');
  await delayed.tick(500);
  assert.equal(delayed.requests.length, 0);

  const running = createEnvironment(); running.mount();
  const active = await start(running, 'Leaving');
  const before = running.results.innerHTML;
  running.unmount();
  assert.equal(active.init.signal.aborted, true, 'Unmount aborts the request');
  await answer(running, active, playerData('MUST_NOT_RENDER'));
  assert.equal(running.results.innerHTML, before, 'A response delivered after unmount cannot mutate results');
  assert.equal(running.countListeners(), 0);
  running.type('After cleanup'); running.emit('keyup'); running.clickMode('team'); await running.tick(500);
  assert.equal(running.requests.length, 1, 'Removed listeners cannot issue subsequent requests');
  passed('Cleanup clears the debounce, removes every installed listener, aborts the active request, and suppresses late responses');
}

function rendererChecks() {
  const actual = createEnvironment().exports;
  const schools = [
    { hsid: '5004', hsname: 'Fixture High & Academy', hslocation: 'Chandler, AZ', current_aa: 42, microsite_url: 'https://fixture.az.yatstats.com', bracket_eligible: true },
    { hsid: '6001', hsname: 'URL Without Bracket', hslocation: 'Phoenix, AZ', current_aa: 8, microsite_url: 'https://other.az.yatstats.com/', bracket_eligible: false },
    { hsid: '7000', hsname: 'Crest Only', hslocation: 'Seattle, WA', current_aa: 0, microsite_url: null, bracket_eligible: true },
  ];
  // Output snapshots of the approved production 618b9ac1 renderer. These cover
  // the shared picker, bracket variant, view-only crest rows and escaped empty
  // text. Ignore only whitespace between tags; this does not hash source code.
  const snapshots = [
    "13adf10667c1152b95cbba9975ebd4ffb55c9d85aafb56bfe8224d7b28f6a9df",
    "d00a779c699844117286d5a81741ab87edfc1717be35db7e6db4f9f29c1dbfb4",
    "ddd823a921e2e0da5bb345848de171cde44d48c6a27e8efcaf7101148d187b18",
    "ddd823a921e2e0da5bb345848de171cde44d48c6a27e8efcaf7101148d187b18",
    "76e26bc3776e5f7e547e3267f6df581ffce7dbf14a3945ef4429b96475e587ee"
  ];
  const markupHash = html => createHash('sha256').update(html.replace(/>\s+</g, '><').trim()).digest('hex');
  const cases = [[schools, 'Empty'], [schools, 'Empty', true], [schools, 'Empty', false, true], [schools, 'Empty', true, true], [[], 'Nothing <found>']];
  cases.forEach((args, index) => {
    assert.equal(markupHash(actual.renderSchoolRows(...args)), snapshots[index], 'Default/crest rendering retains the approved production markup');
  });
  assert.equal(markupHash(actual.renderSchoolRows(schools, 'Empty', true, true, { globalSearch: true })), snapshots[3], 'Global option cannot change view-only crest review');
  const global = actual.renderSchoolRows([schools[0]], 'Empty', true, false, { globalSearch: true });
  const visibleText = global.replace(/<[^>]*>/g, '');
  assert.match(visibleText, /fixture\.az\.yatstats\.com/, 'Global rendering adds a visible destination URL');
  assert.match(global, /class="[^"]*yat-search-school-count[^"]*"/);
  assert.match(global, /<strong>42<\/strong>/, 'The separate count shows the actual API value');
  assert.match(global, /yat-search-school-bracket-link/);
  assert.match(global, /#sec-fantasy/);
  const notBracket = actual.renderSchoolRows([schools[1]], 'Empty', true, false, { globalSearch: true });
  assert.ok(!notBracket.includes('yat-search-school-bracket-link'), 'A destination URL alone does not grant a bracket shortcut');
  const noDestination = actual.renderSchoolRows([schools[2]], 'Empty', true, false, { globalSearch: true });
  assert.ok(!/<a\b/.test(noDestination), 'An unavailable school remains an unlinked row');
  assert.ok(!/href="\/7000/.test(noDestination), 'No fake numeric destination is manufactured');
  assert.ok(!noDestination.includes('yat-search-school-bracket-link'));
  passed('School rendering changes only with the Global option: visible URL plus separate actual count; default and crest markup remain identical; no fake numeric links or implicit bracket eligibility');
}

async function crestChecks() {
  const env = createEnvironment({ queryString: '?schoolSearch=5004' });
  env.mount(); await env.flush();
  assert.equal(env.requests.length, 1, 'A crest handoff performs exactly one initial lookup');
  assert.match(env.requests[0].url, /^\/api\/schools\/search\?hsid=5004(?:&|$)/);
  assert.equal(env.drawer.querySelector('[data-search-mode="school"]').classList.contains('active'), true);
  assert.equal(env.body.classList.contains('drawer-left-open'), true);
  const uploaded = schoolData('Uploaded School');
  await answer(env, env.requests[0], uploaded);
  assert.equal(env.input.value, 'Uploaded School');
  assert.equal(env.results.innerHTML, env.exports.renderSchoolRows(uploaded.programs, 'School not found in Global Search.', false, true));
  await env.tick(1000);
  assert.equal(env.requests.length, 1, 'The exact-school handoff does not recurse or start an extra name query');
  env.unmount();

  const replaced = createEnvironment({ queryString: '?schoolSearch=5004' }); replaced.mount();
  const old = replaced.requests[0];
  replaced.type('New School');
  assert.equal(old.init.signal.aborted, true, 'Typing immediately supersedes the initial crest lookup');
  await answer(replaced, old, schoolData('STALE_UPLOADED_SCHOOL'));
  assert.ok(!replaced.results.innerHTML.includes('STALE_UPLOADED_SCHOOL'));
  await replaced.tick(90);
  assert.equal(replaced.requests.length, 2);
  assert.match(replaced.requests[1].url, /^\/api\/schools\/search\?q=New%20School/);
  await answer(replaced, replaced.requests[1], schoolData('CURRENT_TYPED_SCHOOL'));
  assert.ok(replaced.results.innerHTML.includes('CURRENT_TYPED_SCHOOL'));
  replaced.unmount();
  passed('Crest upload handoff runs one exact-ID request with unchanged view-only output; subsequent typing aborts and replaces it without recursion');
}

(async () => {
  rendererChecks();
  await invalidationChecks();
  await duplicateChecks();
  await errorChecks();
  await cacheChecks();
  await cleanupChecks();
  await crestChecks();
  console.log(JSON.stringify({ passed: true, actualSource: 'src/components/yatstats/SearchDrawerTabs.tsx', checks, isolation: 'Actual transpiled component/effect/renderer with minimal DOM, fake timer, controllable fetch. No live requests, React/browser instrumentation, or repository edits.' }, null, 2));
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
