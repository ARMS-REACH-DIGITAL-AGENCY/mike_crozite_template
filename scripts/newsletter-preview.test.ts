// Unit fixtures only: these are not historical first-day publication proof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readFinishedEdition, renderFinishedEdition, stableJson, type FinishedEdition, type Row } from '../src/lib/newsletter/finishedPublication';
import { archiveFinishedEdition, previewArguments, isolatedPreviewTarget } from './newsletter-preview';

function fixture(): FinishedEdition {
  const game = { stats_date: '2026-03-25', season_key: '2027', region: 7, game_id: 501, week: 1,
    home_hsid: 5004, away_hsid: 7, home_label: 'Hamilton', away_label: 'Other School', home_innings: ['1', '0', '2'], away_innings: ['0', '1', '0'],
    home_runs: 3, away_runs: 1, through_inning: 3, is_final: false };
  return { version: 'finished-publication-v1',
    ready: { cadence: 'daily', period_start: '2026-03-25', period_end: '2026-03-25', season_key: '2027', week: 1,
      cutoff_at: '2026-03-26T11:00:00Z', ready_at: '2026-11-22T12:00:00Z', row_counts: { daily_stat_lines: 2, daily_game_stories: 1, daily_game_scores: 1 } },
    recipient: { firebase_uid: 'fixture-fan', email: 'fixture@example.invalid', first_name: 'Fixture', home_hsid: 5004, home_school_name: 'Hamilton', plan: 'fan', is_superfan: false },
    control: { enabled: false, approved_layout_version: null, approved_by: null },
    selection: { seasonKey: '2027', region: 7, favorites: ['YAT000001'], picks: [{ position: 1, hsid: 7, label: 'Other School' }, { position: 2, hsid: 99, label: 'Idle School' }] },
    rows: {
      daily_stat_lines: [{ stats_date: '2026-03-25', stat_line_id: '1', yatid: 'YAT000001', line: 'Saved batter (Club, MLB): 2-for-4, HR', sort_key: 'a' }],
      daily_game_stories: [{ stats_date: '2026-03-25', hsid: 5004, season_key: '2027', region: 7, game_id: 501, school_name: 'Hamilton',
        opponent_name: 'Other School', title: 'HAMILTON LEADS', story: 'Hamilton leads 3-1.', series_note: 'Game 1 of 3.', shout_outs: [] }],
      daily_game_scores: [game], weekly_player_lines: [], weekly_box_scores: [],
    } };
}
const request = { cadence: 'daily' as const, date: '2026-03-25', email: 'fixture@example.invalid', seasonKey: '2027' };
function database(facts = fixture()) {
  const queries: string[] = [];
  return { queries, async query(sql: string, values: any[] = []) {
    queries.push(sql);
    assert.match(sql, /^SELECT /, 'publication helper must be read-only');
    assert.doesNotMatch(sql, /\b(?:master_bracket|player_game_logs|stat_lines|flip_card_front_stage)\b/i, 'publication reader must not access raw or scoring data');
    if (sql.includes(' FROM edition_ready ')) return { rows: [facts.ready] };
    if (sql.startsWith('SELECT count(*)')) { const name = sql.match(/ FROM (\w+)/)![1]; return { rows: [{ count: facts.ready.row_counts[name] }] }; }
    if (sql.includes(' FROM newsletter_recipients ')) return { rows: [facts.recipient] };
    if (sql.includes(' FROM alumni_newsletter_control')) return { rows: [facts.control] };
    if (sql.includes(' FROM newsletter_favorites ')) return { rows: facts.selection.favorites.map(yatid => ({ yatid })) };
    if (sql.includes(' FROM user_scoreboard_schools ')) return { rows: facts.selection.picks };
    for (const [name, rows] of Object.entries(facts.rows)) if (sql.includes(' FROM ' + name + ' ')) {
      if (name === 'daily_stat_lines') return { rows: rows.filter(row => values[1].includes(row.yatid)) };
      return { rows };
    }
    throw new Error('Unexpected query: ' + sql);
  } };
}

// The publication checks themselves live in src/lib/newsletter/finishedPublication.test.ts
// (run by scripts/test-newsletter-publication.cjs); this file keeps the preview tool's own check.
test('archive is byte-exact and immutable; proof CLI cannot send or silently use production', () => {
  const out = mkdtempSync(join(tmpdir(), 'newsletter-preview-test-'));
  try {
    const rendered = renderFinishedEdition(fixture()), first = archiveFinishedEdition(out, rendered);
    assert.equal(readFileSync(join(first.folder, 'index.html'), 'utf8'), rendered.html);
    assert.equal(readFileSync(join(first.folder, 'edition.txt'), 'utf8'), rendered.text);
    assert.equal(readFileSync(join(first.folder, 'facts.json'), 'utf8'), stableJson(rendered.facts) + '\n');
    assert.deepEqual(archiveFinishedEdition(out, rendered), first);
    assert.throws(() => archiveFinishedEdition(out, { ...rendered, html: rendered.html + 'changed' }), /immutable review copy/);
  } finally { rmSync(out, { recursive: true, force: true }); }
  assert.throws(() => previewArguments(['--send', 'true']), /Unsupported/);
  const args = previewArguments(['--date', '2026-03-25', '--email', 'fixture@example.invalid', '--out', '/tmp/proof',
    '--expected-branch', 'br-isolated', '--expected-endpoint', 'ep-isolated.example.invalid']);
  assert.throws(() => isolatedPreviewTarget(args, { DATABASE_URL: 'postgres://unit:unit@ep-isolated.example.invalid/db', REHEARSAL_NEON_BRANCH: 'br-polished-lab-a4i35u5j' }), /isolated database/);
  assert.throws(() => isolatedPreviewTarget(args, { DATABASE_URL: 'postgres://unit:unit@ep-wrong.example.invalid/db', REHEARSAL_NEON_BRANCH: 'br-isolated' }), /endpoint differs/);
});
