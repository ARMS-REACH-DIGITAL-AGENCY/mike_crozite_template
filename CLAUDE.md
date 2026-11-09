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
- **`teamid_universe_mapping` is canonical:** Pete's own research. No
  scripts, no seeding, no automated writes. Correcting an obvious error (a
  level not spelled the official way) is fine; anything else, report it and
  let Pete decide.
- **ID prefixes (Pete, Nov 2026):** `YAT` is for playerids ONLY. A high
  school is also a team (its 2027 High School Team Page), and its teamid is
  `C` + hsid: `C5004` is the current teamid of Hamilton's 2027 high school
  players (hsid `5004`). Never give a team a `YAT` id.
- **Look before you ask Pete (Nov 2026).** Before asking Pete about dates,
  rules, prizes or past decisions, search the repo (`docs/`,
  `src/lib/bracket/tournamentCalendar.ts`, the bracket components) and the
  earlier Claude Code sessions (`list_sessions` / `list_events`, e.g.
  "Bracket tournament platform audit"). Ask only what neither answers.
- **`public.schools` is a dead table (Pete, Nov 2026).** Never read or write
  it. School data lives in `school_success` (official microsite URLs),
  `tbc_schools_raw` and `player_hsids`.
- **Every player's team is cross-checked through `teamid_universe_mapping`
  (Pete, Nov 2026).** The team name, level and organization/conference on a
  card or profile come from that table's row for the player's Team ID. An
  ACTIVE 2026 player always has a team (from his stat line's Team ID); only
  a FREE AGENT declared through the MLB transactions API has none.
- **FREE AGENT / RETIRED cards (Pete, Nov 2026).** A FREE AGENT or RETIRED
  player has no team: no team and no organization on the card or profile.
  ONLY a RETIRED card lists the player's highest level; every other status
  (FREE AGENT included) shows the level he actually played. A player released
  by an MLB organization who then plays INDY / INTERNATIONAL ball is ACTIVE
  with that team. When a released player becomes RETIRED is Pete's rule to
  set; do not infer one.
- **Never guess a level or a team.** Every stat line has a teamid: look it up.
  Never use fuzzy name matching or a high school's state.
