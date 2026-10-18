# Newly added schools: 2026 statistics coverage

**Read-only audit:** October 18, 2026, approximately 04:30–04:39 UTC. **Code baseline:** `65a85a3d`. **Database:** project `round-recipe-12286668`, verified default/production branch `br-polished-lab-a4i35u5j` (`main`), `neondb`. No database writes, provider configuration changes, purchases, or outbound messages were made for this investigation. Feed credentials and query strings are intentionally omitted.

## Finding

The player directory expanded beyond the original 1,024 schools, but the configured TBC batting/pitching feeds still cover almost entirely that original school group. This is a source-coverage gap. Neither a successful rerun nor a stricter Active filter can manufacture the missing statistics. Saguaro's zero TBC matches do **not** mean that Saguaro has no active alumni.

The production ingest requests three fixed, dedicated provider URLs. It does not send school/player filters or pagination. It stores the complete parsed statistics responses. No configurable wider statistics endpoint, provider roster-update API, or additional current-season source file was found in the inspected repository. TBC describes its [ongoing custom feeds](https://www.thebaseballcube.com/content/about/consulting.asp) as dedicated CSV/JSON URLs; the provider's internal filter and subscription terms are not visible here. The evidence strongly indicates that the identity and statistics feed scopes now differ, but it does not establish why the provider chose those scopes.

## Direct evidence

Both exact configured statistics URLs returned HTTP 200. Fresh CSV parsing at **04:38:34/04:38:36 UTC** produced:

| Source | Rows | Distinct player IDs | Season keys | Saguaro examples present |
|---|---:|---:|---|---|
| Batting feed | 8,997 | 8,053 | `2026` only | None of Cam Caminiti `331408`, Billy Gregory `342517`, Cade Shumard `345532` |
| Pitching feed | 8,144 | 7,048 | `2026` only | None of those three |

The latest landing and canonical 2026 table counts match these responses exactly. The last successful `tbc_safe_ingest` run was **2026-10-17 22:00:23.183 UTC**, with zero consecutive failures and matching 8,997/8,144 downloaded, inserted, and target rows. The inspected responses were downloaded and retained completely; they supplied no pagination metadata.

Joining the current statistics landing IDs to `player_hsids` and the original `school_success."1024_microsites"` membership gives:

| School group | Distinct schools represented | Distinct players within group |
|---|---:|---:|
| Original 1,024 | 1,024 | 14,202 |
| Outside original group | 2 | 15 |

The two additional schools are Canyon View (`17227`, 14 players) and Marana Mountain View (`19486`, 1 player). In comparison, the currently parsed **identity landing** includes **67,457 players across 6,930 schools outside the original group**. These are distinct counts within each group; they should not be summed as an independently deduplicated platform total.

Saguaro (`1773`, 67 linked identities) and Arizona College Prep (`18201`, 7) have **no exact player-ID matches in any of the six** inspected TBC statistics tables: latest batting/pitching landing, historical batting/pitching raw, or canonical batting/pitching 2026. Hamilton (`5004`) has matching rows in all six. A saved Drive [master-data folder](https://drive.google.com/drive/folders/1NjWyo-doPqLjSLPJW5Gct0AszwBaybDt) is explicitly named for the original 1,024 schools and contains historical exports; its inventory did not establish a broader 2026 backfill source.

## Positive 2026 evidence outside the TBC feeds

- [Cam Caminiti's official MiLB record](https://www.milb.com/player/cam-caminiti-807284) identifies Saguaro and shows **24 games, 114.2 innings, 125 strikeouts in 2026**.
- [Grand Canyon's Billy Gregory biography](https://gculopes.com/sports/baseball/roster/billy-gregory/14826) identifies Saguaro and reports **nine appearances and 16 1/3 innings in 2026**.
- [New Mexico State's Cade Shumard page](https://nmstatesports.com/sports/baseball/roster/cade-shumard/11033) identifies Saguaro and his 2026 roster entry; that roster entry alone is not being treated as statistical participation.

Production `player_game_logs` already contains Cam's six Double-A pitching games from August 6 through September 9, 2026: `source='mlb_api'`, top-level `raw_payload.gameType='R'`, `raw_payload.sport.id=12`, and `stats.gamesPlayed=1`. Across schools outside the original group, 2026 MLB-source logs exist for **841 players in 640 schools** before narrower game-type/participation filtering. This source can establish positive season participation for qualifying players even when TBC coverage is missing.

**Do not label a partial game-log sum as complete season statistics.** Cam's stored logs cover only six Double-A games (31.1 innings); the official full-season total also includes his 18 High-A games. The existing game-log importer derives requested levels from a player's current team and known team stints, so incomplete stint coverage can leave earlier levels absent.

## Repair and feed-expansion specification

1. Keep one canonical definition for the Active list, Search tally, school tally, and API membership: positive, identity-matched 2026 batting/pitching evidence. Add qualifying existing MLB game logs as evidence, using actual game participation and regular/postseason game types. Preserve TBC/Indy season totals and deduplicate players across sources.
2. Treat schools with missing statistical coverage as incomplete. Display known positive participation without declaring unverified remaining players retired or presenting an incomplete tally as a complete total.
3. For the existing TBC provider arrangement, prepare a request to expand **both batting and pitching** to the same complete, current player-ID/school universe represented by the identity feed, beyond the original 1,024-school filter. Include all supported college and professional levels; preserve exact `playerid`, `teamid`, year, stint, and supplied stat columns. Request a complete 2026 baseline plus recurring snapshots at the existing cadence. Confirm whether a full-file response or documented pagination applies and request authoritative source-generation timestamps and coverage counts.
4. Acceptance examples: Saguaro `1773`, Arizona College Prep `18201`, and Centennial `3722`; positive 2026 rows for Cam `331408` and Billy `342517` must be represented or accompanied by a precise provider explanation. Do not require every identity to have 2026 stats: historical and retired identities legitimately lack them.
5. Stage the expanded supplied snapshot on an isolated database branch. Compare player/school coverage, verify exact-ID/season/team mappings and duplicates, retain original-school coverage, and prove counts against returned stat rows. Promote only the validated data and preserve it through recurring ingestion. A separate historical backfill should route older seasons to historical tables; it must not replace current-season data.

This is a reviewable request specification, **not a message sent to TBC**, and does not assume that expanded coverage is included in the current commercial agreement.

## Why archived 2026 rows are not an automatic fallback

An additional read-only integration review found 9,351 player IDs in the two historical tables with an explicit `year = '2026'`. Eighteen IDs, linked to eighteen schools, are absent from the four dedicated current-season sources. This difference cannot safely be treated as eighteen missing active players: archives retain superseded identity assignments as well as older snapshots.

One concrete example is Shane Timmons. Production's archived pitching row assigns 2026 Concordia stats to `346639`, the player linked to Los Gatos. The current pitching feed instead contains `384759`, linked to Edison, and contains no 2026 row for `346639`. These are distinct identities:

| Exact player ID | Canonical school | Source evidence |
|---|---|---|
| `346639` | Los Gatos `565` | The [TBC profile](https://www.thebaseballcube.com/content/player/346639/) identifies West Valley College and a 2025 college record. |
| `384759` | Edison `1632` | The [TBC profile](https://www.thebaseballcube.com/content/player/384759/) identifies 2026 Concordia participation; the [official Concordia roster](https://cuigoldeneagles.com/sports/baseball/roster/shane-timmons/10552) independently identifies Edison HS. |

The current feed resolves this example correctly. Reintroducing the archived row into Active membership would again attribute one player's performance to someone else. Keep archived rows as historical evidence requiring reconciliation; do not use a blanket archive union to establish current participation or a current team. The eighteen exceptions should be reconciled against corrected provider identities as part of the request above. They are a mixed review queue, not an automatic backfill list.

At the same review checkpoint, all 32 legacy MLB assignments eligible for a team repair already had dedicated current-season evidence. Removing the archive branches from that read-time repair therefore avoids this unsafe fallback without removing a candidate's season evidence.

## Reproduction queries

Original-group coverage from the current statistics response:

```sql
WITH active_ids AS (
  SELECT playerid FROM public.tbc_batting_landing_latest
  UNION
  SELECT playerid FROM public.tbc_pitching_landing_latest
), linked AS (
  SELECT DISTINCT ph.hsid, ph.playerid,
         ss."1024_microsites" IS NOT NULL AS original_group
  FROM active_ids a
  JOIN public.player_hsids ph ON ph.playerid::text = a.playerid
  LEFT JOIN public.school_success ss ON ss.hsid::text = ph.hsid::text
)
SELECT original_group, COUNT(DISTINCT hsid) AS schools,
       COUNT(DISTINCT playerid) AS players
FROM linked GROUP BY original_group;
```

Exact source coverage for the three comparison schools:

```sql
WITH ids AS (
  SELECT DISTINCT hsid, playerid::text AS playerid
  FROM public.player_hsids WHERE hsid IN (1773, 18201, 5004)
), stats AS (
  SELECT 'batting_landing' AS source, playerid, year
  FROM public.tbc_batting_landing_latest
  UNION ALL SELECT 'pitching_landing', playerid, year
  FROM public.tbc_pitching_landing_latest
  UNION ALL SELECT 'batting_history', playerid, year
  FROM public.tbc_batting_raw
  UNION ALL SELECT 'pitching_history', playerid, year
  FROM public.tbc_pitching_raw
  UNION ALL SELECT 'batting_current', playerid, year
  FROM public.tbc_batting_2026_season_raw
  UNION ALL SELECT 'pitching_current', playerid, year
  FROM public.tbc_pitching_2026_season_raw
)
SELECT i.hsid, s.source, COUNT(*) AS rows,
       COUNT(DISTINCT i.playerid) AS players,
       COUNT(DISTINCT i.playerid) FILTER (WHERE BTRIM(s.year) = '2026')
         AS current_players
FROM ids i JOIN stats s USING (playerid)
GROUP BY i.hsid, s.source ORDER BY i.hsid, s.source;
```
