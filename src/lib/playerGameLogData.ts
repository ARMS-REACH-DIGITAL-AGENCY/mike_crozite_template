// Schedule rendering runs only after the visitor activates Game Log.
// This helper preserves the prior season, team-stint, game matching and
// postseason logic exactly; never run it from the initial profile server component.
import {
  getPlayerGameLogs, getTeamIdMap, getPlayerTeamStints, getTeamSchedule,
  getFlipCardTransactionStatus, getResolvedCurrentTeam, getPlayerById,
} from "@/lib/db";
import { resolveScheduleTeamId, toISODate, formatDisplayDate, shiftIsoDate, levelLabel, mlbTeamLogoUrl } from "@/lib/playerUtils";
import { getTeamLogoUrl, getOriginalForCardCopy } from "@/lib/playerImage";
import type { ScheduleTableRow } from "@/components/yatstats/PlayerScheduleTable";

export async function buildPlayerGameLog(playerId: string): Promise<{
  rows: ScheduleTableRow[]; statHeaders: string[]; todayIso: string; defaultSeason: number;
}> {
  const [gameLogs, teamIdMap, teamStints, transactionStatus, resolvedCurrentTeam, player] = await Promise.all([
    getPlayerGameLogs(playerId), getTeamIdMap(), getPlayerTeamStints(playerId),
    getFlipCardTransactionStatus(playerId), getResolvedCurrentTeam(playerId), getPlayerById(playerId),
  ]);
  const pitchAppearances = gameLogs.filter((g: any) => g.stat_type === "pitching").length;
  const batAppearances = gameLogs.filter((g: any) => g.stat_type === "batting").length;
  const isPitcher = pitchAppearances > batAppearances || (pitchAppearances === batAppearances &&
    /^(?:P|SP|RP|LHP|RHP|PITCHER)(?:[/-]|$)/i.test(String(player?.position || "")));

  // Prefer the reconciled canonical team id. The shared resolver translates
  // MLB source ids and prevents iScore UUIDs from becoming schedule keys.
  const scheduleTeamId = resolveScheduleTeamId(
    transactionStatus,
    teamIdMap,
    resolvedCurrentTeam?.teamid || transactionStatus?.current_teamid || null
  );

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
  function takeGameLog(gamePk: unknown, date: string, preferredType: "batting" | "pitching", scheduleSource?: unknown, sourceGameId?: unknown): any | undefined {
    const pk = String(sourceGameId ?? gamePk ?? "").trim();
    const source = String(scheduleSource ?? "").trim();
    // Legacy schedule rows can still match by date. A named feed must
    // match its own source: an independent game cannot borrow an MLB line
    // merely because the player has one on the same date or with the same id.
    const bucket = ((pk ? logsByGamePk.get(pk) : logsByDate.get(date)) ?? [])
      .filter((row) => !source || row.source === source);
    const open = bucket.filter((r) => !usedLogs.has(r));
    const log = open.find((r) => r.stat_type === preferredType) ?? open[0];
    if (log) {
      // Both of a two-way player's rows belong to this one game.
      for (const r of bucket) if (r.source === log.source && String(r.source_game_id) === String(log.source_game_id)) usedLogs.add(r);
    }
    return log;
  }

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
      const log = takeGameLog(g.game_pk, d, preferredType, g.schedule_source, g.source_game_id);
      const badge = resultBadge(g.result);
      const opponentMlbId = g.is_home ? g.away_team_id : g.home_team_id;
      const stats = statCells(log);
      scheduleTableRows.push({
        kind: "game",
        iso: d,
        season: Number(d.slice(0, 4)),
        dateLabel: formatDisplayDate(d) || d,
        opponent: g.opponent || g.away_team || "--",
        logoUrl: g.opponent_teamid
          ? getOriginalForCardCopy(getTeamLogoUrl(String(g.opponent_teamid)))
          : mlbTeamLogoUrl(teamIdMap, opponentMlbId ?? log?.opponent_mlb_id),
        resultLetter: badge?.letter ?? null,
        resultClass: badge?.className ?? "",
        stats: stats ?? statHeaders.map(() => "-"),
        postseason: POSTSEASON_TYPES.has(String(g.game_type || "")),
        // Infer absence only when this feed tracks individual appearances;
        // a schedule-only source cannot tell us whether he played.
        didNotPlay: !log && st.tracksLines && g.tracks_player_lines !== false && Boolean(badge) && d < todayIso,
      });
    }
  });

  // Any game he played that isn't on a stint's schedule (a team we can't
  // match to a schedule yet) still shows, from his own game log.
  for (const log of gameLogs as any[]) {
    if (usedLogs.has(log)) continue;
    const d = toISODate(log.game_date);
    if (!d) continue;
    const sameGame = (gameLogs as any[]).filter((r) => r.source === log.source && String(r.source_game_id) === String(log.source_game_id));
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


  return { rows: scheduleTableRows, statHeaders, todayIso, defaultSeason: defaultLogSeason };
}
