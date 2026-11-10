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
- **YAT? Baseball Registry (Pete, Nov 2026).** Every player is one person
  with a YAT ID (`YAT` + 6 digits) in `yat_registry`. The YAT ID is ours;
  every outside number (TBC playerid, MLB ID, Perfect Game, MaxPreps, NCAA,
  INDY, ...) attaches to it in `yat_registry_ids` (one outside number = one
  person). New sources add rows there; never re-key a person. Model:
  geni.com. Goal: one ID per player from his first organized game on.
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
  player has no team: no team and no organization on the card or profile,
  and both show his HIGHEST level. A FREE AGENT is treated like RETIRED on
  the card, without the RETIRED label. A released player stays FREE AGENT for
  one year, unless an official retirement notice comes first. A player
  released by an MLB organization who then plays INDY / INTERNATIONAL ball is
  ACTIVE with that team. Every other status shows the level he actually
  plays. Do not infer other status rules: Pete sets them.
- **Explain every approval request first (Pete, Nov 2026).** Before any
  action that will ask Pete to approve it (a Run SQL card, a network card,
  any "Allow Claude to…" prompt), first tell him in one plain sentence what
  it does and why it needs his approval. Example: "Next I'll look up who MLB
  drafted in 1968, round 4, named Smith, to check Stephen Smith's draft line."
- **The truth is there. Find it (Pete, Nov 2026).** When data seems
  missing or wrong, assume it exists and the search is wrong. Never tell
  Pete "we don't have it" or "the source is wrong" until you have stopped,
  checked how you asked (the API call, the table, the ID, a nickname, a
  draft phase) and tried the obvious other ways. Say how you checked.
  Example: MLB's draft API had every secondary-phase pick; it only needed
  `?draftType=JS`. Slow down, use common sense, and don't let a narrow
  query become a conclusion.
- **Never guess a level or a team.** Every stat line has a teamid: look it up.
  Never use fuzzy name matching or a high school's state.
