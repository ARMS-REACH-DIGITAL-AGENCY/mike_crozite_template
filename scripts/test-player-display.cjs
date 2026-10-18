// Run with: node scripts/test-player-display.cjs
// Exercise the actual card/proof/profile consumers with stored-row fixtures.
// Images, interactive children and database transport are stubbed; no live writes.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test harness loads TypeScript and mocked React modules. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const jsxRuntime = require('react/jsx-runtime');

// Next's styled-jsx transform normally consumes these style-only props.
// The metadata test transpiles TSX directly, so remove those props here.
const testJsxRuntime = { ...jsxRuntime };
for (const method of ['jsx', 'jsxs']) {
  testJsxRuntime[method] = (type, props, key) => {
    if (type === 'style' && props.jsx) {
      const styleProps = { ...props };
      delete styleProps.jsx;
      delete styleProps.global;
      return jsxRuntime[method](type, styleProps, key);
    }
    return jsxRuntime[method](type, props, key);
  };
}

const root = path.resolve(__dirname, '..');
const loaded = new Map();
const emptyComponent = { __esModule: true, default: () => null };
const stubs = new Map([
  ['src/components/yatstats/CardPhoto.tsx', emptyComponent],
  ['src/components/yatstats/FavoriteButton.tsx', emptyComponent],
  ['src/components/yatstats/PlayerCardFlipBehavior.tsx', emptyComponent],
  ['src/components/yatstats/PlayerSevenDaySnapshot.tsx', emptyComponent],
  ['src/components/yatstats/FunZone.tsx', emptyComponent],
  ['src/components/yatstats/PlayerCardBackHero.tsx', {
    __esModule: true,
    default: ({ teamName, orgConf, posLevelStatus }) => React.createElement('section', {
      'data-back-team': teamName,
      'data-back-org': orgConf,
      'data-back-status-line': posLevelStatus,
    }),
  }],
]);

let databaseRow = null;
let failPlayerRead = false;
const database = {
  Pool: class {
    async query(sql) {
      if (sql.includes('from tbc_players_raw')) {
        if (failPlayerRead) throw new Error('Fixture database unavailable');
        return { rows: databaseRow ? [databaseRow] : [] };
      }
      if (sql.includes('from flip_card_front_stage')) {
        return { rows: databaseRow ? [databaseRow] : [] };
      }
      if (sql.includes('from player_draft_picks')) return { rows: [] };
      throw new Error(`Unexpected database query in display test: ${sql.slice(0, 80)}`);
    }
  },
};

function load(relativePath) {
  if (stubs.has(relativePath)) return stubs.get(relativePath);
  if (loaded.has(relativePath)) return loaded.get(relativePath);
  const filename = path.join(root, relativePath);
  const exported = {};
  loaded.set(relativePath, exported);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports: exported, process: { env: {} }, global: { __pgPoolShutdownRegistered: true },
    console: { ...console, error: () => {} },
    require(name) {
      if (name === 'react/jsx-runtime') return testJsxRuntime;
      if (name === 'pg') return database;
      if (name === 'server-only') return {};
      if (name === 'next/cache') return { unstable_cache: fn => fn };
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/')
          ? path.join(root, 'src', name.slice(2))
          : path.resolve(path.dirname(filename), name);
        const source = ['.ts', '.tsx'].map(ext => base + ext).find(fs.existsSync);
        if (!source) throw new Error(`Missing local dependency ${name}`);
        return load(path.relative(root, source));
      }
      return require(name);
    },
  }, { filename });
  return exported;
}

const { resolvePlayerDisplay, normalizePlayerLevel } = load('src/lib/playerDisplay.ts');
const { resolveBaselineMetadata } = load('src/lib/playerMetadataEnrichment.ts');
const { isActiveGalleryStatus } = load('src/lib/galleryStatuses.ts');
const PlayerCard = load('src/components/yatstats/PlayerCard.tsx').default;
const ContributeProof = load('src/components/yatstats/ContributeProof.tsx').default;
const { getPlayerIdentityMeta } = load('src/lib/db.ts');

const identity = { playerid: 'fixture-1', hsid: '3722', firstname: 'Test', lastname: 'Alumnus', position: 'P' };
const rosterDeparture = {
  ...identity,
  status_label: 'FREE AGENT', display_status_label: 'FREE AGENT',
  team_affiliation_status: 'FREE AGENT', current_team_source: 'mlb_api',
  current_team_name: null, current_org_or_conference_name: null,
  previous_team_name: 'Iowa Cubs', previous_org_or_conference_name: 'Chicago Cubs',
  level_label: 'AAA', last_transaction_type: null, last_transaction_applied_at: null,
};
const renderCard = player => renderToStaticMarkup(React.createElement(PlayerCard, { player, resolvedHsid: '3722' }));

test('Missing explicit status remains UNKNOWN regardless of season age or an activity flag', () => {
  for (const row of [
    {}, { stat_year: 2005, pitch_year: 2006 }, { stat_year: 2025 },
    { stat_year: 2026, is_active_2025: true },
    { status_label: '  ', display_status_label: null, current_team_name: 'Known Team' },
  ]) {
    assert.equal(resolvePlayerDisplay(row).statusLabel, 'UNKNOWN');
  }
  assert.equal(isActiveGalleryStatus(resolvePlayerDisplay({}).statusLabel), true,
    'Unknown alumni retain the accepted default-gallery membership');
});

test('Explicit display/status values retain precedence and do not infer free agency from a team', () => {
  assert.equal(resolvePlayerDisplay({ display_status_label: ' injured 7-day ', status_label: 'ACTIVE' }).statusLabel, 'INJURED 7-DAY');
  for (const status of ['ACTIVE', 'COACH', 'COMMIT', 'RETIRED', 'FREE AGENT']) {
    assert.equal(resolvePlayerDisplay({ status_label: status }).statusLabel, status);
  }
  const unknown = resolvePlayerDisplay({ current_team_name: 'Known Team', level_label: 'MLB' });
  assert.equal(unknown.statusLabel, 'UNKNOWN');
  assert.equal(unknown.teamName, 'Known Team');
  assert.equal(resolvePlayerDisplay({ display_status_label: 'UNKNOWN', status_label: 'COACH' }).statusLabel, 'COACH');
  assert.equal(resolvePlayerDisplay({ display_status_label: 'RETIRED', status_label: 'UNKNOWN' }).statusLabel, 'RETIRED');
  assert.equal(resolvePlayerDisplay({ display_status_label: '--', status_label: 'ACTIVE' }).statusLabel, 'ACTIVE');
});

test('Explicit MLB roster departures show previous affiliation without inventing transactions', () => {
  for (const status of ['FREE AGENT', 'RETIRED']) {
    const display = resolvePlayerDisplay({ ...rosterDeparture, status_label: status, display_status_label: status, team_affiliation_status: status });
    assert.equal(display.teamName, 'Iowa Cubs');
    assert.equal(display.orgConferenceName, 'Chicago Cubs');
    assert.equal(display.statusLabel, status);
    assert.equal(display.levelLabel, 'TRIPLE-A');
    assert.equal(display.isSourcedDeparture, true);
    assert.equal(display.isTransactionDeparture, false);
  }
});

test('Previous-team fields cannot displace a current assignment or create unsupported departures', () => {
  const current = resolvePlayerDisplay({ ...rosterDeparture, status_label: 'ACTIVE', display_status_label: 'ACTIVE', current_team_name: 'New Team', current_org_or_conference_name: 'New Organization' });
  assert.equal(current.teamName, 'New Team');
  assert.equal(current.orgConferenceName, 'New Organization');
  assert.equal(current.statusLabel, 'ACTIVE');
  assert.equal(current.isSourcedDeparture, false);
  for (const changes of [
    { current_team_source: 'unverified' },
    { status_label: 'ACTIVE', display_status_label: 'ACTIVE' },
    { last_transaction_applied_at: '2026-10-01' },
  ]) {
    assert.equal(resolvePlayerDisplay({ ...rosterDeparture, ...changes }).isSourcedDeparture, false);
  }
});

test('Transaction-owned departures still outrank stale current fields and retain their note eligibility', () => {
  const display = resolvePlayerDisplay({
    ...rosterDeparture, current_team_name: 'Stale Team', status_label: 'ACTIVE', display_status_label: 'ACTIVE',
    last_transaction_type: 'Released', last_transaction_applied_at: '2026-10-01',
  });
  assert.equal(display.statusLabel, 'FREE AGENT');
  assert.equal(display.teamName, 'Iowa Cubs');
  assert.equal(display.orgConferenceName, 'Chicago Cubs');
  assert.equal(display.isTransactionDeparture, true);
});

test('Level aliases are consistent, and generic career NCAA remains generic with no current affiliation claim', () => {
  for (const [raw, expected] of [
    ['AAA', 'TRIPLE-A'], [' aa ', 'DOUBLE-A'], ['A-', 'LOW-A'], ['Single-A', 'LOW-A'],
    ['A+', 'HIGH-A'], ['Rk', 'ROOKIE'], ['NJCAA', 'JUCO'], ['D2', 'NCAA-D2'],
    ['NCAA', 'NCAA'], ['ncaa', 'NCAA'], ['TRIPLE-A (40-MAN)', 'TRIPLE-A'],
  ]) assert.equal(normalizePlayerLevel(raw), expected);
  const career = resolvePlayerDisplay({ career_highlevel: 'NCAA' });
  assert.equal(career.levelLabel, 'NCAA');
  assert.equal(career.statusLabel, 'UNKNOWN');
  assert.equal(career.teamName, '');
  assert.equal(career.orgConferenceName, '');
  assert.equal(resolvePlayerDisplay({ level: 'MLB', display_level_label: 'AA' }).levelLabel, 'DOUBLE-A');
  assert.equal(resolvePlayerDisplay({ level_label: 'AAA', display_level_label: 'UNKNOWN' }).levelLabel, 'TRIPLE-A');
});

test('A baseline patch for an explicitly retired player renders its recorded previous team without a transaction', () => {
  const evidence = {
    stage: { ...identity, status_label: 'RETIRED' },
    latest_stat_year: 2022, latest_teamids: ['10001'], current_teamids: [],
    current_team: null, current_status: null, team_override: null,
    verified_submission: null, college_resolution: null,
  };
  const mapping = [{ teamid: '10001', team_name: 'Iowa Cubs', org_name: 'Chicago Cubs', level: 'AAA', source_team_id: '451', mapping_source: 'canonical' }];
  const result = resolveBaselineMetadata(evidence, mapping, new Date('2026-10-18T00:00:00Z'));
  assert.ok(result.patch, 'The unique recorded team can fill a retired player with explicit status');
  const player = { ...identity, ...result.patch.after };
  assert.equal(player.current_team_source, 'baseline_metadata');
  assert.equal(player.current_team_name, null);
  const display = resolvePlayerDisplay(player);
  assert.equal(display.statusLabel, 'RETIRED');
  assert.equal(display.teamName, 'Iowa Cubs');
  assert.equal(display.orgConferenceName, 'Chicago Cubs');
  assert.equal(display.isTransactionDeparture, false);
  const html = renderCard(player);
  assert.match(html, /class="yat-front-team-name">Iowa Cubs<\/div>/);
  assert.match(html, /data-back-status-line="P - TRIPLE-A - RETIRED"/);
  assert.doesNotMatch(html, /RELEASED|front-chip--departure-note/);
});

test('Card front, back and filter attributes all show the same roster departure without a RELEASED note', () => {
  const html = renderCard(rosterDeparture);
  assert.match(html, /data-status="FREE AGENT"/);
  assert.match(html, /data-level="TRIPLE-A"/);
  assert.match(html, /data-org="CHICAGO CUBS"/);
  assert.match(html, /class="yat-front-team-name">Iowa Cubs<\/div>/);
  assert.match(html, /class="yat-front-org-name">Chicago Cubs<\/div>/);
  assert.match(html, /data-back-team="Iowa Cubs"/);
  assert.match(html, /data-back-org="Chicago Cubs"/);
  assert.match(html, /data-back-status-line="P - TRIPLE-A - FREE AGENT"/);
  assert.doesNotMatch(html, /RELEASED|front-chip--departure-note/);
});

test('Blank-stage historical cards show UNKNOWN and generic NCAA consistently on both faces and filters', () => {
  const html = renderCard({ ...identity, level: 'NCAA', stat_year: 2005, status_label: null });
  assert.match(html, /data-status="UNKNOWN"/);
  assert.match(html, /data-level="NCAA"/);
  assert.match(html, /title="UNKNOWN">UNKNOWN<\/span>/);
  assert.match(html, /data-back-status-line="P - NCAA - UNKNOWN"/);
  assert.doesNotMatch(html, /RETIRED|NCAA-D1/);
});

test('The 40-man tag stays a separate badge and explicit release notes are preserved', () => {
  const active = renderCard({ ...identity, status_label: 'ACTIVE', level_label: 'AAA', display_level_label: 'AAA (40-MAN)', is_on_40man: true, forty_man_org_abbr: 'CHC' });
  assert.match(active, /data-level="TRIPLE-A"/);
  assert.match(active, /CHC 40-MAN/);
  assert.doesNotMatch(active, /AAA \(40-MAN\)/);
  const released = renderCard({ ...rosterDeparture, last_transaction_type: 'Released', last_transaction_date: '2026-10-01', last_transaction_applied_at: '2026-10-01' });
  assert.match(released, /front-chip--departure-note/);
  assert.match(released, /RELEASED 10-01-26/);
});

test('Photo contribution proof uses the same previous team and normalized status/level as the gallery', () => {
  const html = renderToStaticMarkup(React.createElement(ContributeProof, {
    purpose: 'back_hero', src: '/fixture-photo.jpg', crop: null, season: null,
    player: { name: 'Test Alumnus', classOf: null, schoolName: 'Centennial', schoolLocation: 'Peoria, AZ', currentTeam: '' },
    publishedCard: rosterDeparture,
  }));
  assert.match(html, /class="yat-front-team-name">Iowa Cubs<\/div>/);
  assert.match(html, /data-back-team="Iowa Cubs"/);
  assert.match(html, /data-back-status-line="P - TRIPLE-A - FREE AGENT"/);
});

test('Profile identity shows UNKNOWN for blank metadata rather than deriving retirement from absent years', async () => {
  databaseRow = { ...identity, status_label: null, display_status_label: null, career_highlevel: 'NCAA' };
  const profile = await getPlayerIdentityMeta(identity.playerid);
  assert.equal(profile.statusLabel, 'UNKNOWN');
  assert.equal(profile.levelLabel, 'NCAA');
  assert.equal(profile.currentTeamName, '');
});

test('Profile identity consumes the roster-departure provenance and agrees with both card faces', async () => {
  databaseRow = rosterDeparture;
  const profile = await getPlayerIdentityMeta(identity.playerid);
  assert.equal(profile.statusLabel, 'FREE AGENT');
  assert.equal(profile.currentTeamName, 'Iowa Cubs');
  assert.equal(profile.orgConferenceName, 'Chicago Cubs');
  assert.equal(profile.levelLabel, 'TRIPLE-A');
});

test('A profile database failure cannot manufacture a retirement status', async () => {
  failPlayerRead = true;
  try {
    const profile = await getPlayerIdentityMeta(identity.playerid);
    assert.equal(profile.statusLabel, 'UNKNOWN');
    assert.equal(profile.currentTeamName, '');
  } finally {
    failPlayerRead = false;
  }
});
