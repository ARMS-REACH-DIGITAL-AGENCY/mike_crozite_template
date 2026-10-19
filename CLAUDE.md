# Notes for Claude

- **Bracket live test (Oct 2026):** before changing anything in the bracket
  code (`src/components/bracket/`, `src/lib/bracket/`) or on any
  `test/bracket-*` branch, read `docs/bracket-live-test-2026.md`. It holds the
  owner's rules: layout changes go to `Easter-NEWS` only, the test branches
  only get `PIPELINE:` (stats) commits, and `TEST-ONLY:` commits never go to
  `Easter-NEWS`.
- **Official levels only (Pete, Oct 2026):** MLB, TRIPLE-A, DOUBLE-A, HIGH-A,
  SINGLE-A, ROOKIE, INDY, INTERNATIONAL, NCAA-D1, NCAA-D2, NCAA-D3, NAIA,
  NJCAA, CCCAA, NWAC, HIGH SCHOOL - in data, code and in what you write to
  Pete (never "Triple-A", "AAA", "Low-A", "JUCO"). JUCO is NJCAA; CCCAA and
  NWAC are separate levels.
- **`teamid_universe_mapping` is canonical:** Pete's own research. Read it,
  never write to it (no scripts, no fixes, no seeding). Report what looks
  wrong and let Pete decide.
- **Never guess a level or a team.** Every stat line has a teamid: look it up.
  Never use fuzzy name matching or a high school's state.
