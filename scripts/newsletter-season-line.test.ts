// The Digest's season line comes from the card's own season-stats query and
// formatting (Pete, Nov 23 2026): no second computation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestSeasonLines } from './newsletter-publish';
import { buildActiveRosterSql } from '@/lib/activeRosterSql';

// Pitchers: ERA/WHIP/FIP (Pete, Nov 25 2026).
test('Digest season line = card back season stats, same query, same formatting', async () => {
  const queries: { sql: string; values: unknown[] }[] = [];
  const db = { async query(sql: string, values: unknown[] = []) {
    queries.push({ sql, values });
    if (sql.startsWith('SELECT DISTINCT ON (f.yatid)')) return { rows: [
      { yatid: 'YAT000001', card_id: '111' }, { yatid: 'YAT000002', card_id: '222' }, { yatid: 'YAT000003', card_id: '333' }] };
    return { rows: [
      { playerid: '111', avg: 0.3, obp: 0.85, slg: 1.15, era: null, whip: null },
      { playerid: '222', avg: null, obp: null, slg: null, era: 3.2, whip: 1.1, fip: 3.456 },
      { playerid: '333', avg: null, obp: null, slg: null, era: null, whip: null }] };
  } } as never;
  const lines = await digestSeasonLines(db, ['YAT000001', 'YAT000002', 'YAT000003']);
  assert.deepEqual(lines, { YAT000001: { b: '.300/.850/1.150' }, YAT000002: { p: '3.20/1.10/3.46' } });
  // Exactly the query the site runs for a list of cards (getSeasonUsageByPlayerIds).
  assert.equal(queries[1].sql, buildActiveRosterSql('ph.playerid::text = ANY($1)', 'playerid::text = ANY($1)'));
  assert.deepEqual(queries[1].values, [['111', '222', '333']]);
  assert.deepEqual(await digestSeasonLines(db, []), {});
});
