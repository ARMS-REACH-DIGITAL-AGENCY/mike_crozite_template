// src/app/[hsid]/player/[playerId]/[slug]/page.tsx
// Player profile child page — lives inside the shared shell.
// DO NOT touch the shell, layout, or any other file.
//
// Block 3 — Career-path chronological strip
// Block 4 — Two-column player metadata
// Block 5 — Profile-page six-tab FunZone (inline, not the shared FunZone component)

// this file is a Server Component — no "use client"

import {
  findPlayersBySlug,
  getPlayerById,
  getPlayerBattingStats,
  getPlayerPitchingStats,
  getPlayerCareerBatting,
  getPlayerCareerPitching,
  getTeamSchedule,
  getPlayerGameLogs,
  getTeamIdMap,
  getPlayerTeamStints,
  getResolvedCurrentTeam,
  getFlipCardTransactionStatus,
  getNewsByPlayer,
  query,
} from "@/lib/db";
import type { Metadata } from "next";
import { storyAssetUrl } from "@/lib/storyAssets";
import ProfileNewsList, { type ProfileNewsStory } from "@/components/yatstats/ProfileNewsList";
import StoriesFeed from "@/components/yatstats/StoriesFeed";
import { mlbTeamLogoUrl, toISODate, formatDisplayDate, shiftIsoDate, levelLabel } from "@/lib/playerUtils";
import PlayerScheduleTable, { type ScheduleTableRow } from "@/components/yatstats/PlayerScheduleTable";
import { preload } from "react-dom";
type Props = {
  params: Promise<{
    hsid: string;
    playerId: string;
    slug: string;
  }>;
};

const SHARE_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// A shared story link (?story=<id>, from the Share button) previews as that
// story in texts and social apps: its first photo, "<Player> · <Month Year>"
// and the start of the story, instead of the school's crest.
export async function generateMetadata({
  params,
  searchParams,
}: Props & { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const { playerId } = await params;
  const storyParam = (await searchParams)?.story;
  const storyId = typeof storyParam === 'string' && /^\d{1,18}$/.test(storyParam) ? storyParam : null;
  if (!storyId) return {};
  try {
    const { rows } = await query<{
      caption: string | null; contributor_name: string | null; photo_taken_date: string | null; photo_taken_year: number | null;
      s3_key: string | null; width: number | null; height: number | null; first_name: string | null; last_name: string | null;
    }>(
      `SELECT m.caption, m.contributor_name, m.photo_taken_date::text AS photo_taken_date, m.photo_taken_year,
              p.s3_key, p.width, p.height, f.first_name, f.last_name
         FROM player_moment_submissions m
         JOIN player_moment_players me ON me.moment_id = m.id AND me.playerid = $2
         LEFT JOIN LATERAL (SELECT s3_key, width, height FROM player_moment_photos WHERE moment_id = m.id ORDER BY sort_order, id LIMIT 1) p ON true
         LEFT JOIN LATERAL (SELECT first_name, last_name FROM flip_card_front_stage WHERE playerid::text = $2 LIMIT 1) f ON true
        WHERE m.id = $1 AND m.status = 'live' AND COALESCE(m.is_private, false) = false`,
      [storyId, String(playerId)]
    );
    const r = rows[0];
    if (!r) return {};
    const month = r.photo_taken_date ? Number(r.photo_taken_date.slice(5, 7)) : 0;
    const when = [month ? SHARE_MONTHS[month - 1] : '', r.photo_taken_year || ''].filter(Boolean).join(' ');
    const player = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || 'Player';
    const title = when ? `${player} · ${when}` : player;
    const text = String(r.caption || '').replace(/\s+/g, ' ').trim();
    const description = `${text.length > 180 ? `${text.slice(0, 177)}…` : text}${r.contributor_name ? ` Shared by ${r.contributor_name} on YAT?STATS.` : ''}`;
    const image = storyAssetUrl(r.s3_key);
    const images = image ? [{ url: image, ...(r.width && r.height ? { width: r.width, height: r.height } : {}), alt: title }] : undefined;
    return {
      title: `${title} | YAT?STATS`,
      description,
      openGraph: { title, description, type: 'article', siteName: 'YAT?STATS', ...(images ? { images } : {}) },
      twitter: { card: images ? 'summary_large_image' : 'summary', title, description, ...(image ? { images: [image] } : {}) },
    };
  } catch (error) {
    console.error('[stories] share preview failed', error);
    return {};
  }
}

type BattingSeason = {
  year: string | number;
  team_name?: string;
  level?: string;
  g?: any;
  ab?: any;
  r?: any;
  h?: any;
  "2b"?: any;
  "3b"?: any;
  hr?: any;
  rbi?: any;
  sb?: any;
  bb?: any;
  so?: any;
  avg?: any;
  obp?: any;
  slg?: any;
  ops?: any;
  draft_info?: string;
};

type PitchingSeason = {
  year: string | number;
  team_name?: string;
  level?: string;
  g?: any;
  gs?: any;
  w?: any;
  l?: any;
  saves?: any;
  ip?: any;
  er?: any;
  ko?: any;
  bb?: any;
  era?: any;
  whip?: any;
  k9?: any;
  kbb?: any;
  draft_info?: string;
};

function fmt(v: any, decimals = 0): string {
  if (v === null || v === undefined || v === "" || v === "--") return "--";
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (decimals > 0) return n.toFixed(decimals);
  return String(n);
}

function fmtAvg(v: any): string {
  if (v === null || v === undefined || v === "" || v === "--") return "--";
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toFixed(3).replace(/^0/, "");
}

export default async function ProfilePage({ params }: Props) {
  const { hsid, playerId, slug } = await params;
  // Tells the browser to start fetching the career timeline's anchor-slide
  // photos (HS cutout + pro action cutout) as soon as this page's HTML
  // starts arriving, rather than after the timeline's own data fetches
  // finish -- which made the photos land well after the rest of the page.
  // These are the ready-made WebP files the Build Web Cutouts job keeps on
  // S3 (see ZoomableCareerTimeline's webCutoutUrl).
  const cutoutId = encodeURIComponent(String(playerId));
  const cutoutBase = "https://yatstats-assets.s3.us-west-2.amazonaws.com/players";
  // No fetchPriority: React routes a high-priority image preload through a
  // separate queue that never reached this page's HTML (checked on the
  // preview: only the back preload was emitted), so both use the default.
  preload(`${cutoutBase}/then-web/${cutoutId}.webp`, { as: "image" });
  preload(`${cutoutBase}/back-web/${cutoutId}.webp`, { as: "image" });

   let player: any = null;
  let _diagSlugRows: number | null = null;
  let _diagFallbackResult: string | null = null;
  let _diagError: string | null = null;
  try {
    // Primary: slug + hsid lookup (fast, school-scoped)
    const matches = await findPlayersBySlug(slug, hsid);
    _diagSlugRows = matches?.length ?? 0;
    player = matches?.find((p: any) => String(p.playerid) === String(playerId)) ?? null;
    // Fallback: direct playerid lookup (handles slug mismatches or missing player_hsids rows)
    if (!player) {
      const fallback = await getPlayerById(String(playerId));
      _diagFallbackResult = fallback ? `GOT: ${fallback.firstname} ${fallback.lastname}` : "NULL";
      player = fallback;
    }
  } catch (e: any) {
    _diagError = String(e?.message ?? e);
    console.error("DB ERROR:", e);
  }

  if (!player) {
    return (
      <div style={{ padding: "20px", fontFamily: "monospace" }}>
        <h1>No player — diagnostic</h1>
        <p>hsid={hsid} playerId={playerId} slug={slug}</p>
        <p>findPlayersBySlug rows: {_diagSlugRows ?? "not reached"}</p>
        <p>getPlayerById result: {_diagFallbackResult ?? "not reached"}</p>
        <p>exception: {_diagError ?? "none"}</p>
      </div>
    );
  }

  const safePlayerId = String(playerId);

  const playerNewsFullName = [player.firstname, player.lastname]
    .map((value: unknown) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

  const playerCentricRecap = (row: any) => {
    const candidate = String(
      row.gallery_back_json?.yati_recap ?? row.local_recap ?? ""
    ).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!candidate) return null;
    const fullName = playerNewsFullName.toLowerCase();
    if (fullName && !candidate.toLowerCase().includes(fullName)) return null;
    return candidate;
  };

  const newsStories: ProfileNewsStory[] = (await getNewsByPlayer(safePlayerId, null, true)).map((row: any) => ({
    uuid: String(row.uuid),
    title: row.gallery_front_json?.headline ?? row.title ?? "",
    url: row.url,
    source: row.source_full ?? row.source ?? null,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    recap: playerCentricRecap(row),
    whyLocal: row.gallery_back_json?.why_local ?? null,
    imageUrl:
      row.display_image_url ??
      (row.playerid
        ? `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now/${encodeURIComponent(String(row.playerid))}.jpg`
        : null),
    newsworthiness: String(row.newsworthiness || "NORMAL").toUpperCase(),
    tease:
      row.tease_json?.body ??
      row.summary ??
      null,
  }));

  const firstName = (player.firstname || "").trim();
  const lastName = (player.lastname || "").trim();
  const displayName = `${firstName} ${lastName}`.trim() || safePlayerId;

  const [
    battingSeasons,
    pitchingSeasons,
    careerBatting,
    careerPitching,
    resolvedCurrentTeam,
    transactionStatus,
  ] = await Promise.all([
    getPlayerBattingStats(safePlayerId),
    getPlayerPitchingStats(safePlayerId),
    getPlayerCareerBatting(safePlayerId),
    getPlayerCareerPitching(safePlayerId),
    getResolvedCurrentTeam(safePlayerId),
    getFlipCardTransactionStatus(safePlayerId),
  ]);

  const latestYear = Math.max(
    ...battingSeasons.map((s: any) => Number(s.year) || 0),
    ...pitchingSeasons.map((s: any) => Number(s.year) || 0),
    0
  );

  const isPitcher =
    pitchingSeasons.length > 0 &&
    (battingSeasons.length === 0 || pitchingSeasons.length >= battingSeasons.length);

  const isActive = latestYear >= 2025;
  const rawStatusLabel = isActive ? "ACTIVE" : "RETIRED";

  const resolvedTeamName = (resolvedCurrentTeam?.team_name || "").trim();
  const resolvedLevel = resolvedCurrentTeam?.level
    ? String(resolvedCurrentTeam.level).toUpperCase()
    : "";

  const mostRecentSeason = [...battingSeasons, ...pitchingSeasons]
    .sort(
      (a: BattingSeason | PitchingSeason, b: BattingSeason | PitchingSeason) =>
        (Number(b.year) || 0) - (Number(a.year) || 0)
    )[0] as BattingSeason | PitchingSeason | undefined;

  const rawCtxTeam = resolvedTeamName || mostRecentSeason?.team_name || "";
  const ctxLevel =
    resolvedLevel ||
    (mostRecentSeason?.level ? String(mostRecentSeason.level).toUpperCase() : "");

  // Sourced-fact override: a confirmed MLB transaction (or, failing
  // that, confirmed multi-run roster absence) outranks both
  // v_player_current_team_resolved and any stat-derived team name,
  // since neither of those notices a player leaving affiliated baseball.
  // See scripts/apply-mlb-transaction-status.ts and the roster-accuracy
  // audit findings on the two disconnected resolvers.
  const affiliationStatus = String(transactionStatus?.team_affiliation_status || "").trim().toUpperCase();
  const lastTransactionType = String(transactionStatus?.last_transaction_type || "").trim();
  const isSourcedDeparture =
    (affiliationStatus === "FREE AGENT" || affiliationStatus === "RETIRED") && !!lastTransactionType;
  const previousTeamName = String(transactionStatus?.previous_team_name || "").trim();
  const previousOrgOrConferenceName = String(transactionStatus?.previous_org_or_conference_name || "").trim();

  const statusLabel = isSourcedDeparture ? affiliationStatus : rawStatusLabel;
  const ctxTeam = isSourcedDeparture ? previousTeamName || rawCtxTeam : rawCtxTeam;

  // flip_card_front_stage.current_team_source_team_id is the reconciled,
  // single source of truth for "current team" (kept accurate by the college
  // and pro ingest pipelines alike) - it takes priority over both the dead
  // v_player_current_team_resolved chain and a player's most recent stat-
  // bearing season, which can point at a stale team after a transfer or a
  // redshirt year with no season on record yet.
  // current_team_source_team_id is the raw MLB Stats API team id (e.g. 147
  // for the Yankees) when the source is mlb_api - NOT the tbc_teamid that
  // v_team_schedule_feed/college_schedule_games_raw and this codebase's own
  // team logos are keyed by (Yankees there is 20, not 147). Kept separately
  // so the schedule fetch below can translate it; the other two fallbacks
  // already return tbc-scheme ids.
  const currentTeamSource = String((transactionStatus as any)?.current_team_source || "").trim();

  const rawMlbTeamId = (transactionStatus as any)?.current_team_source_team_id
    ? String((transactionStatus as any).current_team_source_team_id)
    : null;

  const currentTeamId = rawMlbTeamId
    ? rawMlbTeamId
    : resolvedCurrentTeam?.teamid
      ? String(resolvedCurrentTeam.teamid)
      : (mostRecentSeason as any)?.teamid
        ? String((mostRecentSeason as any).teamid)
        : null;

  // getTeamContext (removed) queried teams.organization/conference, columns
  // that table doesn't have, so it failed on every profile load and always
  // came back empty. Not re-pointed at teams.organization_name: that
  // table's team ids don't line up with TBC's, so it would attach the wrong
  // organization. Same (empty) result as before, minus a failing query.
  const rawCurrentOrgOrConference = "";
  const currentOrgOrConference = isSourcedDeparture
    ? previousOrgOrConferenceName
    : rawCurrentOrgOrConference;

  const draftInfo =
    ([...battingSeasons, ...pitchingSeasons] as any[]).find((s) => s.draft_info)
      ?.draft_info || "N/A";

  const ncaaSeasonsList = [...battingSeasons, ...pitchingSeasons]
    .filter((s: any) => {
      const lv = String(s.level || "").toUpperCase();
      return (
        lv.includes("NCAA") ||
        lv === "JUCO" ||
        lv.includes("COLLEGE") ||
        lv === "NAIA"
      );
    })
    .sort((a: any, b: any) => (Number(a.year) || 0) - (Number(b.year) || 0));

  const uniqueColleges: string[] = [];
  for (const s of ncaaSeasonsList) {
    const tn = ((s as any).team_name || "").trim();
    if (tn && !uniqueColleges.includes(tn)) uniqueColleges.push(tn);
  }

  const collegesLine = uniqueColleges.length ? uniqueColleges.join(", ") : "N/A";

  const CURRENT_SEASON = new Date().getFullYear();

  const currentBatSeason = (
    isActive
      ? battingSeasons
          .filter((s: any) => Number(s.year) === CURRENT_SEASON)
          .slice(-1)[0] ??
        battingSeasons
          .filter((s: any) => Number(s.year) === latestYear)
          .slice(-1)[0]
      : null
  ) as BattingSeason | null;

  const currentPitSeason = (
    isActive
      ? pitchingSeasons
          .filter((s: any) => Number(s.year) === CURRENT_SEASON)
          .slice(-1)[0] ??
        pitchingSeasons
          .filter((s: any) => Number(s.year) === latestYear)
          .slice(-1)[0]
      : null
  ) as PitchingSeason | null;

  const [gameLogs, teamIdMap, teamStints] = await Promise.all([
    getPlayerGameLogs(safePlayerId),
    getTeamIdMap(),
    getPlayerTeamStints(safePlayerId),
  ]);

  // current_team_source_team_id only needs translating through team_id_map
  // when it's actually a raw MLB Stats API id, i.e. current_team_source is
  // 'mlb_api' - team_id_map is keyed 1:1 by each pro team's own raw id at
  // any level (MLB or any minor-league affiliate), so this resolves a
  // minor leaguer's own affiliate team the same way it resolves an MLB
  // roster player's team. The college/HS tbc_* pipelines store the
  // already-correct tbc_teamid in this same field, so running THAT through
  // team_id_map (a pro-only crosswalk) would just fail to find it - that
  // silently broke every college player's schedule until this check existed.
  const scheduleTeamId = rawMlbTeamId
    ? currentTeamSource === "mlb_api"
      ? teamIdMap.get(rawMlbTeamId) || null
      : rawMlbTeamId
    : currentTeamId;

  // ── Game Log: every game his team played, stint by stint ──────────────────
  // player_team_stints says which team he was on and when (a trade, call-up,
  // demotion or college -> pro move starts a new stint). Each stint lists
  // every game that team played in that window - his line where he played,
  // "Did not play" where he didn't - which the Fantasy Bracket relies on. The
  // open stint (no end) runs on into upcoming games, next season included.
  // Players the stints job hasn't reached fall back to their current team.
  // College stints have no per-game lines on file, so their past games stay
  // blank rather than "Did not play" (tracksLines false).
  const NO_GAME_LOGS_LEVEL = /NCAA|NAIA|NJCAA|CCCAA|NWAC|HIGH SCHOOL/i;
  type LogStint = {
    teamid: string;
    teamName: string | null;
    level: string | null;
    start: string | null;
    end: string | null;
    tracksLines: boolean;
  };
  const sortedStints = [...teamStints].sort((a, b) => a.stint_start.localeCompare(b.stint_start));
  const logStints: LogStint[] = sortedStints.length
    ? sortedStints.map((st, i) => {
        // A stint never runs past the start of the next one (last season's
        // open stint stops where this season's first stint begins).
        const next = sortedStints[i + 1];
        const dayBeforeNext = next ? shiftIsoDate(next.stint_start, -1) : null;
        const end = dayBeforeNext && (!st.stint_end || st.stint_end > dayBeforeNext) ? dayBeforeNext : st.stint_end;
        return {
          teamid: st.teamid,
          teamName: st.team_name,
          level: st.level,
          start: st.stint_start,
          end,
          tracksLines: !NO_GAME_LOGS_LEVEL.test(st.level || ""),
        };
      })
    : scheduleTeamId
      ? // No stint dates yet, so no way to tell a game he sat out from one
        // before he joined: no "Did not play" here.
        [{ teamid: scheduleTeamId, teamName: null, level: null, start: null, end: null, tracksLines: false }]
      : [];
  const stintSchedules = await Promise.all(
    logStints.map((st) => getTeamSchedule(st.teamid, 400, { from: st.start, to: st.end }))
  );

  // His game log rows, found by game id (pro) or by date (a schedule with no
  // game id). Each row is used once, so a doubleheader's two games each get
  // their own line and anything left over still shows (see below).
  const usedLogs = new Set<any>();
  const logsByGamePk = new Map<string, any[]>();
  const logsByDate = new Map<string, any[]>();
  for (const row of gameLogs as any[]) {
    const pk = String(row.source_game_id || "").trim();
    if (pk) logsByGamePk.set(pk, [...(logsByGamePk.get(pk) ?? []), row]);
    const d = toISODate(row.game_date);
    if (d) logsByDate.set(d, [...(logsByDate.get(d) ?? []), row]);
  }
  // A two-way player can have a batting and a pitching row for one game:
  // prefer the one this page's columns show.
  function takeGameLog(gamePk: unknown, date: string, preferredType: "batting" | "pitching"): any | undefined {
    const pk = String(gamePk ?? "").trim();
    const bucket = (pk ? logsByGamePk.get(pk) : logsByDate.get(date)) ?? [];
    const open = bucket.filter((r) => !usedLogs.has(r));
    const log = open.find((r) => r.stat_type === preferredType) ?? open[0];
    if (log) {
      // Both of a two-way player's rows belong to this one game.
      for (const r of bucket) if (String(r.source_game_id) === String(log.source_game_id)) usedLogs.add(r);
    }
    return log;
  }

  // ── Stats grids ──────────────────────────────────────────────────────────────

  const currentBattingGrid = currentBatSeason
    ? [
        { k: "AVG", v: fmtAvg(currentBatSeason.avg) },
        { k: "OBP", v: fmtAvg(currentBatSeason.obp) },
        { k: "SLG", v: fmtAvg(currentBatSeason.slg) },
        { k: "OPS", v: fmtAvg(currentBatSeason.ops) },
        { k: "HR", v: fmt(currentBatSeason.hr) },
        { k: "RBI", v: fmt(currentBatSeason.rbi) },
        { k: "H", v: fmt(currentBatSeason.h) },
        { k: "AB", v: fmt(currentBatSeason.ab) },
        { k: "R", v: fmt(currentBatSeason.r) },
        { k: "SB", v: fmt(currentBatSeason.sb) },
        { k: "BB", v: fmt(currentBatSeason.bb) },
        { k: "G", v: fmt(currentBatSeason.g) },
      ]
    : [];

  const currentPitchingGrid = currentPitSeason
    ? [
        { k: "ERA", v: fmt(currentPitSeason.era, 2) },
        { k: "WHIP", v: fmt(currentPitSeason.whip, 2) },
        { k: "IP", v: fmt(currentPitSeason.ip, 1) },
        { k: "W-L", v: `${fmt(currentPitSeason.w)}-${fmt(currentPitSeason.l)}` },
        { k: "K", v: fmt(currentPitSeason.ko) },
        { k: "BB", v: fmt(currentPitSeason.bb) },
        { k: "SV", v: fmt(currentPitSeason.saves) },
        { k: "G", v: fmt(currentPitSeason.g) },
        { k: "GS", v: fmt(currentPitSeason.gs) },
        { k: "ER", v: fmt(currentPitSeason.er) },
        { k: "K/9", v: fmt(currentPitSeason.k9, 2) },
        { k: "K/BB", v: fmt(currentPitSeason.kbb, 2) },
      ]
    : [];

  const careerBattingGrid = careerBatting
    ? [
        { k: "AVG", v: fmtAvg(careerBatting.avg) },
        { k: "OBP", v: fmtAvg(careerBatting.obp) },
        { k: "SLG", v: fmtAvg(careerBatting.slg) },
        { k: "OPS", v: fmtAvg(careerBatting.ops) },
        { k: "HR", v: fmt(careerBatting.hr) },
        { k: "RBI", v: fmt(careerBatting.rbi) },
        { k: "H", v: fmt(careerBatting.h) },
        { k: "AB", v: fmt(careerBatting.ab) },
        { k: "R", v: fmt(careerBatting.r) },
        { k: "SB", v: fmt(careerBatting.sb) },
        { k: "BB", v: fmt(careerBatting.bb) },
        { k: "G", v: fmt(careerBatting.g) },
      ]
    : [];

  const careerPitchingGrid = careerPitching
    ? [
        { k: "ERA", v: fmt(careerPitching.era, 2) },
        { k: "WHIP", v: fmt(careerPitching.whip, 2) },
        { k: "IP", v: fmt(careerPitching.ip, 1) },
        { k: "W-L", v: `${fmt(careerPitching.w)}-${fmt(careerPitching.l)}` },
        { k: "K", v: fmt(careerPitching.ko) },
        { k: "BB", v: fmt(careerPitching.bb) },
        { k: "SV", v: fmt(careerPitching.saves) },
        { k: "GP", v: fmt(careerPitching.g) },
        { k: "ER", v: fmt(careerPitching.er) },
        { k: "K/9", v: fmt(careerPitching.k9, 2) },
        { k: "K/BB", v: fmt(careerPitching.kbb, 2) },
        { k: "FIP", v: "--" },
      ]
    : [];

  const currentStatsGrid = isActive
    ? isPitcher
      ? currentPitchingGrid
      : currentBattingGrid
    : isPitcher
      ? careerPitchingGrid
      : careerBattingGrid;

  const currentStatsLabel = isActive
    ? `${CURRENT_SEASON} ${isPitcher ? "PITCHING" : "BATTING"}`
    : `CAREER ${isPitcher ? "PITCHING" : "BATTING"}`;

  // ── Season table rows ─────────────────────────────────────────────────────────

  const allSeasons = isPitcher
    ? pitchingSeasons.sort(
        (a: any, b: any) => (Number(a.year) || 0) - (Number(b.year) || 0)
      )
    : battingSeasons.sort(
        (a: any, b: any) => (Number(a.year) || 0) - (Number(b.year) || 0)
      );

  // ── Schedule rows ─────────────────────────────────────────────────────────────

  // No cap here on purpose - this is the full season, every game, one row
  // each, chronological ascending (game 1 -> last game). getTeamSchedule's
  // own `limit` param (default 300) is the only cap. Past and upcoming
  // games render in a single table (PlayerScheduleTable) rather than two
  // separate ones - a fan can sort any column, including flipping the
  // default ascending date order to descending, so there's no need to
  // pre-split into "recent" vs "upcoming" buckets here.
  const todayIso = new Date().toISOString().slice(0, 10);

  // ── Game log columns ────────────────────────────────────────────────────────
  // The same stat columns, in the same order and with the same formulas, as
  // the season-by-season table on the Stats tab (ProfileStatsInjector) -
  // one game per row instead of one season. G is left out (always 1).

  function gnum(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  function grate(v: number): string {
    return Number.isFinite(v) ? v.toFixed(3).replace(/^0/, "") : "";
  }
  function gdec(v: number): string {
    return Number.isFinite(v) ? v.toFixed(2) : "";
  }
  function ipToOuts(v: unknown): number {
    const [whole, part] = String(v ?? "").split(".");
    return (Number(whole) || 0) * 3 + (Number(part) || 0);
  }

  const BATTING_LOG_HEADERS = ["AB", "R", "H", "2B", "3B", "HR", "RBI", "SB", "CS", "BB", "SO", "HBP", "SH", "SF", "IBB", "GDP", "TB", "PA", "XBH", "1B", "AVG", "OBP", "SLG", "OPS", "SECA", "ISO", "BABIP"];
  const PITCHING_LOG_HEADERS = ["W", "L", "GS", "CG", "SHO", "GR", "GF", "SV", "IP", "H", "R", "ER", "HR", "BB", "SO", "WP", "BK", "HB", "ERA", "WHIP", "H/9", "HR/9", "BB/9", "K/9", "RA/9", "K/BB"];

  function battingLogCells(stats: Record<string, unknown>): string[] {
    const ab = gnum(stats.atBats), r = gnum(stats.runs), h = gnum(stats.hits), d = gnum(stats.doubles), t = gnum(stats.triples);
    const hr = gnum(stats.homeRuns), rbi = gnum(stats.rbi), sb = gnum(stats.stolenBases), cs = gnum(stats.caughtStealing);
    const bb = gnum(stats.baseOnBalls), so = gnum(stats.strikeOuts), hbp = gnum(stats.hitByPitch), sh = gnum(stats.sacBunts);
    const sf = gnum(stats.sacFlies), ibb = gnum(stats.intentionalWalks), gdp = gnum(stats.groundIntoDoublePlay);
    const tb = stats.totalBases != null ? gnum(stats.totalBases) : h + d + 2 * t + 3 * hr;
    const pa = stats.plateAppearances != null ? gnum(stats.plateAppearances) : ab + bb + hbp + sf + sh;
    const avg = ab > 0 ? h / ab : NaN;
    const obpDen = ab + bb + hbp + sf;
    const obp = obpDen > 0 ? (h + bb + hbp) / obpDen : NaN;
    const slg = ab > 0 ? tb / ab : NaN;
    const babipDen = ab - hr - so + sf;
    return [
      ab, r, h, d, t, hr, rbi, sb, cs, bb, so, hbp, sh, sf, ibb, gdp, tb, pa, d + t + hr, h - d - t - hr,
      grate(avg), grate(obp), grate(slg),
      Number.isFinite(obp) && Number.isFinite(slg) ? grate(obp + slg) : "",
      ab > 0 ? grate((bb + (tb - h) + sb - cs) / ab) : "",
      Number.isFinite(slg) && Number.isFinite(avg) ? grate(slg - avg) : "",
      babipDen > 0 ? grate((h - hr) / babipDen) : "",
    ].map(String);
  }

  function pitchingLogCells(stats: Record<string, unknown>): string[] {
    const outs = stats.outs != null ? gnum(stats.outs) : ipToOuts(stats.inningsPitched);
    const inn = outs / 3;
    const h = gnum(stats.hits), r = gnum(stats.runs), er = gnum(stats.earnedRuns), hr = gnum(stats.homeRuns);
    const bb = gnum(stats.baseOnBalls), so = gnum(stats.strikeOuts);
    const gs = gnum(stats.gamesStarted);
    const per9 = (v: number) => (inn > 0 ? gdec((v * 9) / inn) : "");
    return [
      gnum(stats.wins), gnum(stats.losses), gs, gnum(stats.completeGames), gnum(stats.shutouts), gs > 0 ? 0 : 1,
      gnum(stats.gamesFinished), gnum(stats.saves),
      `${Math.floor(outs / 3)}.${outs % 3}`,
      h, r, er, hr, bb, so, gnum(stats.wildPitches), gnum(stats.balks), gnum(stats.hitBatsmen ?? stats.hitByPitch),
      per9(er), inn > 0 ? gdec((h + bb) / inn) : "", per9(h), per9(hr), per9(bb), per9(so), per9(r),
      bb > 0 ? gdec(so / bb) : "",
    ].map(String);
  }

  function resultBadge(result: unknown): { letter: "W" | "L" | "T"; className: string } | null {
    const r = String(result || "").trim();
    if (r.startsWith("W")) return { letter: "W", className: "pp-result-w" };
    if (r.startsWith("L")) return { letter: "L", className: "pp-result-l" };
    if (r.startsWith("T")) return { letter: "T", className: "pp-result-t" };
    return null;
  }

  const statHeaders = isPitcher ? PITCHING_LOG_HEADERS : BATTING_LOG_HEADERS;

  const preferredType = isPitcher ? "pitching" : "batting";
  // MLB gameType codes for playoff games (wild card through World Series,
  // MiLB playoffs and the Triple-A championship).
  const POSTSEASON_TYPES = new Set(["F", "D", "L", "W", "C", "P"]);
  const NEVER_PLAYED_STATUS = /^(scheduled|pre-game|warmup)$/i;
  function statCells(log: any): string[] | null {
    return log?.stats && typeof log.stats === "object" && log.stat_type === preferredType
      ? isPitcher
        ? pitchingLogCells(log.stats as Record<string, unknown>)
        : battingLogCells(log.stats as Record<string, unknown>)
      : null;
  }

  const scheduleTableRows: ScheduleTableRow[] = [];
  logStints.forEach((st, si) => {
    const games = (stintSchedules[si] as any[])
      .slice()
      .sort((a: any, b: any) => toISODate(a.game_date).localeCompare(toISODate(b.game_date)));
    // A marker where he moved to another team during a season, and a "With"
    // marker opening any season he spent with more than one team.
    const season = st.start ? st.start.slice(0, 4) : "";
    const prev = logStints[si - 1];
    const next = logStints[si + 1];
    const prevSameSeason = Boolean(prev?.start && prev.start.slice(0, 4) === season);
    const nextSameSeason = Boolean(next?.start && next.start.slice(0, 4) === season);
    if (st.start && (prevSameSeason || nextSameSeason)) {
      const verb = !prevSameSeason ? "With" : prev.teamid === st.teamid ? "Rejoined" : "Joined";
      scheduleTableRows.push({
        kind: "move",
        iso: st.start,
        season: Number(st.start.slice(0, 4)),
        dateLabel: formatDisplayDate(st.start) || st.start,
        opponent: "",
        logoUrl: null,
        resultLetter: null,
        resultClass: "",
        stats: [],
        note: `${verb} ${games[0]?.team_name || st.teamName || "new team"}${st.level ? ` · ${levelLabel(st.level)}` : ""}`,
      });
    }

    for (const g of games) {
      const d = toISODate(g.game_date);
      if (!d) continue;
      // A past MLB/MiLB game still "Scheduled" was never played (e.g. an
      // if-necessary playoff game that wasn't needed, still in team_schedules
      // after MLB dropped it): kept in the table, left off the Game Log.
      // Only MLB-fed games (with a game id): MLB keeps their status current,
      // while the college schedule scrape leaves past games "Scheduled".
      if (g.game_pk && d < todayIso && NEVER_PLAYED_STATUS.test(String(g.status || "").trim())) continue;
      const log = takeGameLog(g.game_pk, d, preferredType);
      const badge = resultBadge(g.result);
      const opponentMlbId = g.is_home ? g.away_team_id : g.home_team_id;
      const stats = statCells(log);
      scheduleTableRows.push({
        kind: "game",
        iso: d,
        season: Number(d.slice(0, 4)),
        dateLabel: formatDisplayDate(d) || d,
        opponent: g.opponent || g.away_team || "--",
        logoUrl: mlbTeamLogoUrl(teamIdMap, opponentMlbId ?? log?.opponent_mlb_id),
        resultLetter: badge?.letter ?? null,
        resultClass: badge?.className ?? "",
        stats: stats ?? statHeaders.map(() => "-"),
        postseason: POSTSEASON_TYPES.has(String(g.game_type || "")),
        // A finished game (before today, so the 4-hourly game log sync has
        // caught up) with no line of his.
        didNotPlay: !log && st.tracksLines && Boolean(badge) && d < todayIso,
      });
    }
  });

  // Any game he played that isn't on a stint's schedule (a team we can't
  // match to a schedule yet) still shows, from his own game log.
  for (const log of gameLogs as any[]) {
    if (usedLogs.has(log)) continue;
    const d = toISODate(log.game_date);
    if (!d) continue;
    const sameGame = (gameLogs as any[]).filter((r) => String(r.source_game_id) === String(log.source_game_id));
    const pick = sameGame.find((r) => r.stat_type === preferredType) ?? log;
    for (const r of sameGame) usedLogs.add(r);
    const win = String(pick.is_win ?? "").toLowerCase();
    const letter = win === "true" ? "W" : win === "false" ? "L" : null;
    scheduleTableRows.push({
      kind: "game",
      iso: d,
      season: Number(d.slice(0, 4)),
      dateLabel: formatDisplayDate(d) || d,
      opponent: pick.opponent_name || "--",
      logoUrl: mlbTeamLogoUrl(teamIdMap, pick.opponent_mlb_id),
      resultLetter: letter,
      resultClass: letter === "W" ? "pp-result-w" : letter === "L" ? "pp-result-l" : "",
      stats: statCells(pick) ?? statHeaders.map(() => "-"),
      postseason: POSTSEASON_TYPES.has(String(pick.raw_game_type || "")),
    });
  }
  scheduleTableRows.sort((a, b) => a.iso.localeCompare(b.iso) || (a.kind === "move" ? -1 : b.kind === "move" ? 1 : 0));

  // Opens on this season when it has games, else the latest season before
  // it, else the first one coming up.
  const logSeasons = [...new Set(scheduleTableRows.map((r) => r.season))].sort((a, b) => a - b);
  const thisYear = Number(todayIso.slice(0, 4));
  const defaultLogSeason = logSeasons.includes(thisYear)
    ? thisYear
    : ([...logSeasons].reverse().find((y) => y < thisYear) ?? logSeasons[0] ?? thisYear);

  // ── Social handles ────────────────────────────────────────────────────────────

  const xHandle = (player.x_handle || player.twitter_handle || "").replace(/^@/, "");
  const igHandle = (player.ig_handle || player.instagram_handle || "").replace(/^@/, "");

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════════════
          BLOCK 5 — Profile-page FunZone (six-tab, inline implementation)
          Block 4 (metadata chips) is now rendered in layout.tsx Row 4 via row4Content.
          ═══════════════════════════════════════════════════════════════════════ */}
        <div className="pp-funzone-outer">
        <section className="pp-funzone" id="playerFunZone">

        {/* ── SCHEDULE tab ─────────────────────────────────────────────────── */}
        <div id="ppTab-schedule" className="pp-fz-panel">
          {scheduleTableRows.length > 0 ? (
            <PlayerScheduleTable
              rows={scheduleTableRows}
              statHeaders={statHeaders}
              todayIso={todayIso}
              defaultSeason={defaultLogSeason}
            />
          ) : (
            <div className="pp-fz-placeholder">
              <i className="ri-calendar-line pp-ph-icon" />
              <p>Schedule will appear here once available.</p>
            </div>
          )}
        </div>

        {/* ── STATS tab (default visible) ───────────────────────────────────── */}
        <div id="ppTab-stats" className="pp-fz-panel">

          {/* Current / career headline grid */}
          {currentStatsGrid.length > 0 && (
            <div className="pp-stats-section">
              <div className="pp-stats-bar">{currentStatsLabel}</div>
              <div className="pp-stats-grid">
                {currentStatsGrid.map(({ k, v }) => (
                  <div key={k} className="pp-stat-cell">
                    <div className="pp-stat-label">{k}</div>
                    <div className="pp-stat-val">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Season-by-season table */}
          {allSeasons.length > 0 && (
            <div className="pp-stats-section">
              <div className="pp-stats-bar">SEASON BY SEASON</div>
              <div className="pp-season-table-wrap">
                <table className="pp-season-table">
                  <thead>
                    {isPitcher ? (
                      <tr>
                        <th>YR</th>
                        <th>TEAM</th>
                        <th>LV</th>
                        <th className="num">ERA</th>
                        <th className="num">IP</th>
                        <th className="num">K</th>
                        <th className="num">BB</th>
                        <th className="num">WHIP</th>
                        <th className="num">W</th>
                        <th className="num">L</th>
                        <th className="num">SV</th>
                      </tr>
                    ) : (
                      <tr>
                        <th>YR</th>
                        <th>TEAM</th>
                        <th>LV</th>
                        <th className="num">AVG</th>
                        <th className="num">HR</th>
                        <th className="num">RBI</th>
                        <th className="num">H</th>
                        <th className="num">AB</th>
                        <th className="num">R</th>
                        <th className="num">SB</th>
                        <th className="num">OPS</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {allSeasons.map((s: any, i: number) =>
                      isPitcher ? (
                        <tr key={i}>
                          <td>{s.year || "--"}</td>
                          <td>{s.team_name || "--"}</td>
                          <td>{s.level || "--"}</td>
                          <td className="num">{fmt(s.era, 2)}</td>
                          <td className="num">{fmt(s.ip, 1)}</td>
                          <td className="num">{fmt(s.ko)}</td>
                          <td className="num">{fmt(s.bb)}</td>
                          <td className="num">{fmt(s.whip, 2)}</td>
                          <td className="num">{fmt(s.w)}</td>
                          <td className="num">{fmt(s.l)}</td>
                          <td className="num">{fmt(s.saves)}</td>
                        </tr>
                      ) : (
                        <tr key={i}>
                          <td>{s.year || "--"}</td>
                          <td>{s.team_name || "--"}</td>
                          <td>{s.level || "--"}</td>
                          <td className="num">{fmtAvg(s.avg)}</td>
                          <td className="num">{fmt(s.hr)}</td>
                          <td className="num">{fmt(s.rbi)}</td>
                          <td className="num">{fmt(s.h)}</td>
                          <td className="num">{fmt(s.ab)}</td>
                          <td className="num">{fmt(s.r)}</td>
                          <td className="num">{fmt(s.sb)}</td>
                          <td className="num">{fmtAvg(s.ops)}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Career totals (opposite type if both exist) */}
          {!isPitcher && careerBattingGrid.length > 0 && (
            <div className="pp-stats-section">
              <div className="pp-stats-bar">CAREER BATTING TOTALS</div>
              <div className="pp-stats-grid">
                {careerBattingGrid.map(({ k, v }) => (
                  <div key={k} className="pp-stat-cell">
                    <div className="pp-stat-label">{k}</div>
                    <div className="pp-stat-val">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {isPitcher && careerPitchingGrid.length > 0 && (
            <div className="pp-stats-section">
              <div className="pp-stats-bar">CAREER PITCHING TOTALS</div>
              <div className="pp-stats-grid">
                {careerPitchingGrid.map(({ k, v }) => (
                  <div key={k} className="pp-stat-cell">
                    <div className="pp-stat-label">{k}</div>
                    <div className="pp-stat-val">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStatsGrid.length === 0 && allSeasons.length === 0 && (
            <div className="pp-fz-placeholder">
              <i className="ri-bar-chart-2-line pp-ph-icon" />
              <p>Stats will appear here once available.</p>
            </div>
          )}
        </div>

        {/* ── NEWS tab ─────────────────────────────────────────────────────── */}
        <div id="ppTab-news" className="pp-fz-panel">
          <ProfileNewsList stories={newsStories} firstName={firstName} playerId={safePlayerId} playerName={playerNewsFullName} />
        </div>

        {/* ── SOCIAL tab ───────────────────────────────────────────────────── */}
        <div id="ppTab-social" className="pp-fz-panel">
          <div className="pp-social-tag">#YATABOY</div>
          <div className="pp-social-sub">Show some love for {firstName}!</div>
          <div className="pp-social-links">
            {xHandle && (
              <a
                href={`https://x.com/${xHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pp-social-link"
              >
                <i className="ri-twitter-x-line" /> @{xHandle}
              </a>
            )}
            {igHandle && (
              <a
                href={`https://instagram.com/${igHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pp-social-link"
              >
                <i className="ri-instagram-line" /> @{igHandle}
              </a>
            )}
            {!xHandle && !igHandle && (
              <div className="pp-fz-placeholder">
                <i className="ri-share-line pp-ph-icon" />
                <p>Social links will appear here once available.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── CONNECT tab ──────────────────────────────────────────────────── */}
        <div id="ppTab-connect" className="pp-fz-panel">
          <div className="pp-fz-placeholder">
            <i className="ri-group-line pp-ph-icon" />
            <p>
              Connect with {firstName} through the{" "}
              <strong>Mentorship Marketplace</strong>.
            </p>
          </div>
        </div>

        {/* ── UPLOAD tab ───────────────────────────────────────────────────── */}
        <div id="ppTab-upload" className="pp-fz-panel pp-fz-panel-default">
          <StoriesFeed playerId={safePlayerId} playerName={playerNewsFullName} />
        </div>

        {/* The icon row that switches these tabs is rendered by
            ProfileFunZoneStabilizer, pinned above the footer ad. */}

      </section>
      </div>{/* /pp-funzone-outer */}

      {/* ═══════════════════════════════════════════════════════════════════════
          INLINE STYLES — scoped to this page only, no global changes
          ═══════════════════════════════════════════════════════════════════════ */}
      <style>{`
        /* ── Block 4: Metadata chip row — rendered in yat-row4-shell via layout.tsx row4Content ── */
        .pp-meta-chips {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 0;
        }
        .pp-meta-chip {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 10px 8px 8px;
          border-right: 1px solid rgba(255,255,255,.08);
          text-align: center;
          min-width: 0;
        }
        .pp-meta-chip:first-child {
          border-left: 1px solid rgba(255,255,255,.08);
        }
        .pp-mc-val {
          display: block;
          font: 700 clamp(14px, 2.2vw, 22px)/1 "Bebas Neue", sans-serif;
          letter-spacing: .04em;
          color: var(--fg, #f4f4f4);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
        .pp-mc-lbl {
          display: block;
          font: 300 9px/1.1 Oswald, sans-serif;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: rgba(255,255,255,.7);
          white-space: nowrap;
        }
        .pp-mc-active { color: #20d67b; }
        .pp-mc-retired { color: #888; }

        /* ── Block 5: FunZone — fixed-height flex column ─────────────── */
        /*
         * Block 5 occupies exactly the viewport space between the sticky
         * rows (Row 1–4) and the fixed footer (Row 6 / Block 6).
         * Row heights from YatStyles :root:
         *   --row1-h : 36px   (34px on mobile)
         *   --row2-h : 54px   (48px on mobile)
         *   --row3-h : 100px  (career strip)
         *   --row4-h : 56px   (metadata chips)
         *   --footerH: clamp(56px,8vh,77px)
         * Row 5 shell adds padding-top: 8px.
         *
         * pp-funzone fills the remaining height as a flex column:
         *   - active pp-fz-panel grows to fill the space and scrolls internally
         *   - pp-fz-tabs-shell is the last flex child, always at the bottom
         */
        /* Outer wrapper — full-width background, centered fixed-width inner */
        .pp-funzone-outer {
          width: 100%;
          background: var(--card-bg, #1a1a1a);
        }
        .pp-funzone {
          max-width: 1400px;
          margin: 0 auto;
          padding: 0 12px;
          display: flex;
          flex-direction: column;
          /*
           * body already has padding-bottom: var(--footerH) which pushes
           * <main> up above the fixed footer — so we must NOT subtract
           * --footerH here or we get a double-gap.
           * We only subtract the sticky rows above Block 5 and the 8px
           * padding-top of .yat-row5-shell.
           */
          height: calc(
            100dvh
            - var(--row1-h, 36px)
            - var(--row2-h, 54px)
            - var(--row3-h, 100px)
            - var(--row4-h, 56px)
            - 8px
          );
          min-height: 0;
        }

        /* Tab strip — last flex child, always at the bottom of Block 5 */
        .pp-fz-tabs-shell {
          flex-shrink: 0;
          z-index: 50;
          background: var(--card-bg, #1a1a1a);
          border-top: 1px solid var(--line, rgba(255,255,255,.08));
          width: 100%;
        }

        /* Tab strip — full width of pp-funzone (already constrained) */
        .pp-fz-tabs {
          display: flex;
          flex-direction: row;
          width: 100%;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .pp-fz-tabs::-webkit-scrollbar { display: none; }
        .pp-fz-tab {
          flex: 1 1 0;
          min-width: 52px;
          max-width: calc(100% / 6);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          padding: 10px 4px 8px;
          font: 600 8px/1 Oswald, sans-serif;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--muted, #888);
          text-decoration: none;
          border-top: 2px solid transparent;
          transition: color .15s, border-color .15s;
        }
        .pp-fz-tab i { font-size: 16px; }
        .pp-fz-tab:hover {
          color: var(--fg, #f0f0f0);
          border-top-color: var(--accent, #c8a96e);
        }
        /* Default active tab (Stats) — shown when no hash is targeted */
        .pp-fz-tab-default {
          color: var(--fg, #f0f0f0);
          border-top-color: var(--accent, #c8a96e);
        }
        /* When any non-stats tab is targeted, remove active style from default STATS tab */
        body:has(#ppTab-schedule:target) .pp-fz-tab-default,
        body:has(#ppTab-news:target) .pp-fz-tab-default,
        body:has(#ppTab-social:target) .pp-fz-tab-default,
        body:has(#ppTab-connect:target) .pp-fz-tab-default,
        body:has(#ppTab-upload:target) .pp-fz-tab-default {
          color: var(--muted, #888);
          border-top-color: transparent;
        }
        /* Active indicator follows the :target tab */
        body:has(#ppTab-schedule:target) a[href="#ppTab-schedule"],
        body:has(#ppTab-stats:target) a[href="#ppTab-stats"],
        body:has(#ppTab-news:target) a[href="#ppTab-news"],
        body:has(#ppTab-social:target) a[href="#ppTab-social"],
        body:has(#ppTab-connect:target) a[href="#ppTab-connect"],
        body:has(#ppTab-upload:target) a[href="#ppTab-upload"] {
          color: var(--fg, #f0f0f0);
          border-top-color: var(--accent, #c8a96e);
        }

        /* Tab panels — all hidden by default; :target shows the targeted one */
        .pp-fz-panel {
          display: none;
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding: 14px 12px;
        }
        /* Stories is the default visible panel (a link that names a tab
           opens that one instead) */
        .pp-fz-panel-default {
          display: flex;
          flex-direction: column;
        }
        /* When a tab anchor is targeted, show that panel and hide the default */
        #ppTab-schedule:target,
        #ppTab-stats:target,
        #ppTab-news:target,
        #ppTab-social:target,
        #ppTab-connect:target,
        #ppTab-upload:target {
          display: flex;
          flex-direction: column;
        }
        /* When any other tab is targeted, hide the default panel */
        body:has(.pp-fz-panel:target) .pp-fz-panel-default:not(:target) {
          display: none;
        }

        /* Stats grid */
        .pp-stats-section { margin-bottom: 16px; }
        .pp-stats-bar {
          background: rgba(255,255,255,.06);
          color: var(--fg, #f0f0f0);
          text-align: center;
          padding: 5px 8px;
          font: 700 10px "Bebas Neue", sans-serif;
          letter-spacing: .08em;
          border-radius: 4px;
          margin-bottom: 6px;
        }
        .pp-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 4px;
        }
        .pp-stat-cell {
          background: rgba(255,255,255,.05);
          border-radius: 6px;
          padding: 6px 4px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .pp-stat-label {
          font: 600 8px/1 Oswald, sans-serif;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--muted, #888);
        }
        .pp-stat-val {
          font: 700 15px/1 "Bebas Neue", sans-serif;
          color: var(--fg, #f0f0f0);
        }

        /* Season table */
        .pp-season-table-wrap {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 6px;
        }
        .pp-season-table {
          width: 100%;
          border-collapse: collapse;
          font: 400 10px/1.4 Oswald, sans-serif;
          min-width: 480px;
        }
        .pp-season-table th {
          font: 600 8px/1 Oswald, sans-serif;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--muted, #888);
          padding: 6px 6px;
          border-bottom: 1px solid var(--line, rgba(255,255,255,.08));
          text-align: left;
          background: var(--card-bg, #1a1a1a);
          white-space: nowrap;
        }
        .pp-season-table th.num,
        .pp-season-table td.num {
          text-align: right;
        }
        .pp-season-table td {
          padding: 6px 6px;
          border-bottom: 1px solid var(--line, rgba(255,255,255,.06));
          white-space: nowrap;
          color: var(--fg, #f0f0f0);
        }
        .pp-season-table tr:hover td {
          background: rgba(255,255,255,.025);
        }

        /* Social */
        .pp-social-tag {
          font: 700 20px/1 "Bebas Neue", sans-serif;
          letter-spacing: .06em;
          color: var(--accent, #c8a96e);
          margin-bottom: 4px;
        }
        .pp-social-sub {
          font: 400 11px/1.4 Oswald, sans-serif;
          color: var(--muted, #888);
          margin-bottom: 12px;
        }
        .pp-social-links {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .pp-social-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font: 400 12px/1 Oswald, sans-serif;
          color: var(--fg, #f0f0f0);
          text-decoration: none;
          padding: 8px 12px;
          background: rgba(255,255,255,.06);
          border-radius: 6px;
        }
        .pp-social-link:hover {
          background: rgba(255,255,255,.1);
        }

        /* Placeholder */
        .pp-fz-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 24px 16px;
          text-align: center;
          color: var(--muted, #888);
        }
        .pp-ph-icon {
          font-size: 28px;
          opacity: .4;
        }
        .pp-fz-placeholder p {
          font: 400 11px/1.5 Oswald, sans-serif;
          max-width: 240px;
        }
      `}</style>
    </>
  );
}
