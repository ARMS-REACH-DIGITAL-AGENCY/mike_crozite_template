// src/lib/bracket/appearance.test.ts
// Run: npx tsx --test src/lib/bracket/appearance.test.ts
// Regression (Nov 13, 2026): the stat drawer showed OPS+ 0 / FIP- 0 for
// alumni who didn't bat or pitch; it must show a dash for them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { battedIn, pitchedIn } from './appearance';

test('no plate appearances: no OPS+', () => {
  assert.equal(battedIn([0, 0, 0, 0, 0, 0, 0, 0, 0]), false);
  assert.equal(battedIn(0), false);
  assert.equal(battedIn(null), false);
  assert.equal(battedIn(undefined), false);
});

test('a plate appearance gives an OPS+, even with no at-bat (a walk)', () => {
  assert.equal(battedIn([1, 0, 0, 0, 0, 0, 1, 0, 0]), true);
  assert.equal(battedIn([4, 4, 0, 0, 0, 0, 0, 0, 0]), true);
});

test('did not pitch: no FIP-', () => {
  assert.equal(pitchedIn([0, 0, 0, 0, 0, 0, 0, 0, 0]), false);
  assert.equal(pitchedIn(0), false);
  assert.equal(pitchedIn(null), false);
});

test('a single allowed with no out and no FIP event: no FIP-', () => {
  assert.equal(pitchedIn([0, 0, 0, 0, 0, 1, 1, 1, 0]), false);
});

test('an out, strikeout, walk, hit batter or homer gives a FIP-', () => {
  assert.equal(pitchedIn([1, 0, 0, 0, 0, 0, 0, 0, 0]), true);
  assert.equal(pitchedIn([0, 1, 0, 0, 0, 1, 1, 1, 0]), true);
  assert.equal(pitchedIn([0, 0, 1, 0, 0, 0, 0, 0, 0]), true);
  assert.equal(pitchedIn([0, 0, 0, 1, 0, 0, 0, 0, 0]), true);
  assert.equal(pitchedIn([0, 0, 0, 0, 1, 0, 0, 0, 0]), true);
});
