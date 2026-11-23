import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardNextGameLines } from './nextGameLine';

test('Digest Next Game = the card\'s own wording, for both stored date formats (Pete, Nov 23 2026)', () => {
  const a = cardNextGameLines('2027-04-02', '', 'America/Phoenix', 'away', 'Peoria Javelinas');
  const b = cardNextGameLines('Friday | April 02, 2027', '', 'America/Phoenix', '@', 'Peoria Javelinas');
  assert.ok(a && b);
  assert.equal(a!.dateLine, b!.dateLine, 'both stored formats read the same');
  assert.match(a!.dateLine, /^Friday \| /);
  assert.equal(a!.opponentLine, '@ Peoria Javelinas');
  assert.equal(cardNextGameLines('2027-04-02', '', '', 'HOME', 'X')!.opponentLine, 'vs. X');
  assert.equal(cardNextGameLines('', '', '', 'vs.', 'X'), null, 'no date: no Next Game, as on the card');
  assert.equal(cardNextGameLines('2027-04-02', '', '', 'vs.', ''), null, 'no opponent: no Next Game, as on the card');
});
