'use strict';
// The W-L inning: each day counts for the real team the player was on that
// day; the latest real evidence wins (Pete, Nov 19 2026). Never a guess.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const src = fs.readFileSync('src/lib/bracket/clubOnDay.ts', 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText)(mod, mod.exports);
const { clubOnDay, moveOf } = mod.exports;
const none = new Map();

// Transactions as moves.
assert.deepEqual(moveOf(3, 'Trade', 'Milwaukee Brewers', 'New York Mets'), [3, 'Milwaukee Brewers', 'New York Mets']);
assert.deepEqual(moveOf(1, 'Released', null, 'Milwaukee Brewers'), [1, 'Milwaukee Brewers', ''], 'released: no team');
assert.deepEqual(moveOf(1, 'Declared Free Agency', null, 'Tampa Bay Rays'), [1, 'Tampa Bay Rays', '']);
assert.equal(moveOf(-84, 'Status Change', 'American League All-Stars', 'American League All-Stars'), null, 'All-Star Game is not a team');
assert.deepEqual(moveOf(5, 'Status Change', null, 'New York Yankees'), [5, 'New York Yankees', 'New York Yankees'], 'back from rehab: on his club');
assert.deepEqual(moveOf(5, 'Number Change', null, 'Boston Red Sox'), [5, 'Boston Red Sox', 'Boston Red Sox']);
// A rehab assignment, then back: Scranton while on rehab, the Yankees after.
const rehab = [moveOf(-142, 'Assigned', 'New York Yankees', 'Scranton/Wilkes-Barre RailRiders'), moveOf(-120, 'Status Change', null, 'New York Yankees')];
assert.equal(clubOnDay(0, none, rehab, 'New York Yankees'), 'New York Yankees');

// A trade mid-week: Brewers Monday-Tuesday, Mets from Wednesday.
const trade = [[2, 'Milwaukee Brewers', 'New York Mets']];
assert.equal(clubOnDay(0, none, trade, 'New York Mets'), 'Milwaukee Brewers', 'before the trade: where he came from');
assert.equal(clubOnDay(1, none, trade, 'New York Mets'), 'Milwaukee Brewers');
assert.equal(clubOnDay(2, none, trade, 'New York Mets'), 'New York Mets');
assert.equal(clubOnDay(6, none, trade, 'New York Mets'), 'New York Mets');

// Released Oct 1, signed Oct 30: no team in between, the new team after.
const rel = [[-30, 'Tampa Bay Rays', 'Tampa Bay Rays'], [0, 'Tampa Bay Rays', ''], [29, '', 'Seattle Mariners']];
assert.equal(clubOnDay(10, none, rel, ''), '', 'released: 0-0, never a guessed team');
assert.equal(clubOnDay(29, none, rel, ''), 'Seattle Mariners', 'the newer transaction wins');

// Signed with the MLB club in February; MLB's roster check has him on the
// Double-A team: the newer roster check wins.
const signed = [[-226, '', 'San Diego Padres']];
assert.equal(clubOnDay(3, none, signed, 'San Antonio Missions', [[1, 'San Antonio Missions'], [2, 'San Antonio Missions']]), 'San Antonio Missions');

// The All-Star break never moves him off his club.
assert.equal(clubOnDay(4, none, [moveOf(3, 'Status Change', 'National League All-Stars', 'National League All-Stars')].filter(Boolean), 'Milwaukee Brewers', [[2, 'Milwaukee Brewers']]), 'Milwaukee Brewers');

// Same day: a game line beats a move; a move beats the roster check.
assert.equal(clubOnDay(3, new Map([[3, 'Columbus Clippers']]), [[3, 'Columbus Clippers', 'Cleveland Guardians']], ''), 'Columbus Clippers');
assert.equal(clubOnDay(3, none, [[3, 'Columbus Clippers', 'Cleveland Guardians']], '', [[3, 'Columbus Clippers']]), 'Cleveland Guardians');

// No evidence at all: his listed team.
assert.equal(clubOnDay(3, none, [], 'Milwaukee Brewers'), 'Milwaukee Brewers');

// The scoring sums the days (not one team for the whole week).
const live = fs.readFileSync('src/components/bracket/liveSeason.ts', 'utf8');
assert.match(live, /const club = clubOf\(p, from \+ d\);/);
assert.match(live, /const \[w, l\] = clubWl\(club, from \+ d, from \+ d\);/);
assert.ok(!/clubWl\(club, from, Math\.min\(from \+ 6, today\)\)/.test(live), 'never one team for the whole week');
console.log('bracket club on day OK');
