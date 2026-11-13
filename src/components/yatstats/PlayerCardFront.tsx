import "./PlayerCardFront.css";
import { CSSProperties } from "react";
import { getApprovedFrontPhotoSources, getPlayerThenCardUrl, getPlayerThenImageUrl, getThenSilhouetteUrl } from "@/lib/playerImage";
import { resolvePlayerDisplay } from "@/lib/playerDisplay";
import CardPhoto from "./CardPhoto";
import FavoriteButton from "./FavoriteButton";

interface PlayerCardFrontProps {
  player: Record<string, unknown>;
  frontImageUrl?: string | null;
  isAllTime?: boolean;
  /** When true, the grad class year is estimated (derived from TBC playyears), not verified by school. */
  gradClassEstimated?: boolean;
  /** The player's high school: the corner favorite star saves it with him. */
  hsid?: string;
  /** One of a gallery's first cards: its photo loads with the page, not on scroll. */
  eager?: boolean;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asDateTimeText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value instanceof Date) return value.toISOString();
  return "";
}

function asTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
  }
  return [];
}

function asBoolean(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "t" || v === "1" || v === "yes" || v === "y";
  }
  return false;
}

function formatNameParts(player: Record<string, unknown>) {
  const displayName = asText(player.display_name);
  const firstName = asText(player.first_name || player.firstname);
  const lastName = asText(player.last_name || player.lastname);

  if (firstName || lastName) {
    return {
      first: firstName || "--",
      last: lastName || "",
    };
  }

  if (displayName) {
    const parts = displayName.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return { first: parts[0], last: "" };
    }
    return {
      first: parts.slice(0, -1).join(" "),
      last: parts.slice(-1).join(" "),
    };
  }

  return { first: "--", last: "" };
}

function formatOpponentPrefix(value: string): string {
  const v = value.trim().toUpperCase();
  if (!v) return "";
  if (v === "AWAY" || v === "@") return "@";
  if (v === "HOME" || v === "VS" || v === "VS.") return "vs.";
  return value.trim();
}

function getLocalDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value || "0000";
  const month = parts.find((p) => p.type === "month")?.value || "00";
  const day = parts.find((p) => p.type === "day")?.value || "00";

  return `${year}-${month}-${day}`;
}

function formatGameDateInTimeZone(date: Date, timeZone: string) {
  return {
    dayLine: date.toLocaleDateString("en-US", { weekday: "long", timeZone }),
    dateLine: date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone,
    }),
  };
}

const MONTH_INDEX: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  december: 11,
};

function parseDateOnlyText(value: string): { key: string; date: Date } | null {
  const raw = value.replace(/\s+/g, " ").trim();

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);

    return {
      key: `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`,
      date: new Date(Date.UTC(year, month, day, 12, 0, 0)),
    };
  }

  const longMatch = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!longMatch) return null;

  const month = MONTH_INDEX[longMatch[1].toLowerCase()];
  if (month === undefined) return null;

  const day = Number(longMatch[2]);
  const year = Number(longMatch[3]);
  const monthNumber = String(month + 1).padStart(2, "0");
  const dayNumber = String(day).padStart(2, "0");

  return {
    key: `${year}-${monthNumber}-${dayNumber}`,
    date: new Date(Date.UTC(year, month, day, 12, 0, 0)),
  };
}

function formatDateOnlyText(date: Date) {
  return {
    dayLine: date.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC",
    }),
    dateLine: date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}

function tryFormatGameDate(
  value: string,
  gameTimeUtc: string,
  timeZone: string,
) {
  const safeTimeZone = timeZone || "America/Phoenix";
  const raw = value.trim();
  const nowLocalDateKey = getLocalDateKey(new Date(), safeTimeZone);
  const parsedGameTimeUtc = new Date(gameTimeUtc);

  if (!Number.isNaN(parsedGameTimeUtc.getTime())) {
    const gameLocalDateKey = getLocalDateKey(parsedGameTimeUtc, safeTimeZone);
    const formatted = formatGameDateInTimeZone(parsedGameTimeUtc, safeTimeZone);

    return {
      dayLine: gameLocalDateKey === nowLocalDateKey ? "TODAY" : formatted.dayLine,
      dateLine: formatted.dateLine,
    };
  }

  if (!raw) return { dayLine: "TBD", dateLine: "" };

  function formatDatePart(dateText: string) {
    const dateOnly = parseDateOnlyText(dateText);

    if (dateOnly) {
      const formatted = formatDateOnlyText(dateOnly.date);
      return {
        dayLine: dateOnly.key === nowLocalDateKey ? "TODAY" : formatted.dayLine,
        dateLine: formatted.dateLine,
      };
    }

    const parsedDate = new Date(dateText);
    if (Number.isNaN(parsedDate.getTime())) return null;

    const dateKey = getLocalDateKey(parsedDate, safeTimeZone);
    const formatted = formatGameDateInTimeZone(parsedDate, safeTimeZone);

    return {
      dayLine: dateKey === nowLocalDateKey ? "TODAY" : formatted.dayLine,
      dateLine: formatted.dateLine,
    };
  }

  if (raw.toUpperCase().startsWith("TODAY |")) {
    const datePart = raw.split("|").slice(1).join("|").trim();
    return formatDatePart(datePart) || { dayLine: "TODAY", dateLine: datePart };
  }

  const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const datePart = parts.slice(1).join(" | ");
    return formatDatePart(datePart) || { dayLine: parts[0], dateLine: datePart };
  }

  return formatDatePart(raw) || { dayLine: raw, dateLine: "" };
}

function formatTimeZoneLabel(value: string): string {
  const v = value.trim();

  const map: Record<string, string> = {
    "America/Phoenix": "MST",
    "America/Denver": "MST",
    "America/Los_Angeles": "PST",
    "America/New_York": "EST",
    "America/Chicago": "CST",
  };

  return map[v] || v;
}

function normalizeColor(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v;
  if (/^[a-z]+$/i.test(v)) return v;
  return "";
}

function getAccentColor(player: Record<string, unknown>): string {
  const candidates = [
    asText(player.color1),
    asText(player.school_color1),
    asText(player.primary_color),
    asText(player.hs_color1),
    asText(player.team_color1),
  ];

  for (const c of candidates) {
    const normalized = normalizeColor(c);
    if (normalized) return normalized;
  }

  return "#8a1538";
}

function getAccentBorderColor(player: Record<string, unknown>): string {
  const candidates = [
    asText(player.color2),
    asText(player.school_color2),
    asText(player.secondary_color),
    asText(player.hs_color2),
    asText(player.team_color2),
  ];

  for (const c of candidates) {
    const normalized = normalizeColor(c);
    if (normalized) return normalized;
  }

  return "rgba(255,255,255,0.38)";
}

function normalizeImageUrl(value: string | null | undefined): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) return "";
  if (text.toLowerCase() === "null") return "";
  if (text.toLowerCase() === "undefined") return "";

  return text;
}

function formatCommitStatusLabel(player: Record<string, unknown>, statusLabel: string): string {
  if (statusLabel.toUpperCase() !== "COMMIT") return statusLabel;

  const committedTeamName = asText(player.resolved_committed_team_short_name)
    || asText(player.committed_team_name)
    || asText(player.resolved_committed_team_name);

  if (!committedTeamName) return statusLabel;

  return `${committedTeamName} Commit`.toUpperCase();
}

// last_transaction_date is a SQL `date` column; node-postgres returns it as
// a JS Date (midnight UTC), not a string, so asText() alone won't read it.
// Short MM-DD-YY form for the compact departure-note chip (shares the
// 40-MAN chip's slot, so it needs to be just as terse).
function formatTransactionDate(value: unknown): string {
  const iso = value instanceof Date ? value.toISOString() : asText(value);
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  const yy = String(parsed.getUTCFullYear()).slice(-2);
  return `${mm}-${dd}-${yy}`;
}

export default function PlayerCardFront({
  player: p,
  frontImageUrl = null,
  gradClassEstimated = false,
  hsid = "",
  eager = false,
}: PlayerCardFrontProps) {
  const imageId = String(p.playerid || "");
  const thenSilhouetteUrl = getThenSilhouetteUrl({
    isPitcher: p.is_pitcher,
    position: p.position,
    bats: p.bats,
    throws: p.throws,
  });
  // A designated photo is used as-is; otherwise the card-size copy of
  // players/then/{id}.jpg, falling back to the original (see CardPhoto).
  const designatedPhotoUrl = normalizeImageUrl(frontImageUrl);
  const photoSrcs = designatedPhotoUrl
    ? getApprovedFrontPhotoSources(designatedPhotoUrl)
    : [getPlayerThenCardUrl(imageId), getPlayerThenImageUrl(imageId)];

  const { first, last } = formatNameParts(p);

  const classOf = asText(p.class_of);
  const rosterYears = asTextArray(p.roster_years);

  const display = resolvePlayerDisplay(p);
  const statusLabel = display.statusLabel;
  const isRetired = /^RETIRED(?:\b|\s*-)/i.test(statusLabel);
  // FREE AGENT and RETIRED: no team, no organization, no 40-man pill.
  const hasNoTeam = isRetired || display.hasNoTeam;
  const showFortyManPill = asBoolean(p.is_on_40man) && !hasNoTeam;
  // AFL is an exhibition-league roster assignment, not an MLB debut.
  // Only the visible chip says AFL; canonical backend levels remain intact.
  const visibleLevelLabel = asText(p.current_team_source) === "mlb_api_afl"
    ? "AFL"
    : display.levelLabel;
  const fortyManOrgName = asText(p.forty_man_org_name);
  const fortyManOrgAbbr = asText(p.forty_man_org_abbr);
  const fortyManPillTitle = fortyManOrgName
    ? `${fortyManOrgName} 40-man roster`
    : "MLB 40-man roster";
  const fortyManPillLabel = fortyManOrgAbbr ? `${fortyManOrgAbbr} 40-MAN` : "40-MAN";

  const displayTeamName = hasNoTeam ? "" : display.teamName;
  const isArizonaFallLeague = asText(p.current_team_source) === "mlb_api_afl";
  const aflParentOrg = asText(p.afl_parent_org_name);
  // Preserve the official AFL league identity and the prospect's parent MLB
  // organization without changing either canonical team or level mappings.
  const displayOrgLine = hasNoTeam
    ? ""
    : isArizonaFallLeague && aflParentOrg
      ? `AFL · ${aflParentOrg}`
      : display.orgConferenceName;
  const lastTransactionType = asText(p.last_transaction_type);
  const lastTransactionDateLabel = formatTransactionDate(p.last_transaction_date);
  const statusPillLabel = formatCommitStatusLabel(p, statusLabel);

  // RETIRED is a status (shown via statusPillLabel above, alongside
  // ACTIVE/FREE AGENT) — it does NOT belong in this note slot. This slot
  // is exclusively for the RELEASED note, which only applies to a FREE
  // AGENT card whose terminal transaction was specifically a release
  // (not e.g. MLB's "Declared Free Agency" type, which has no note of
  // its own — the FREE AGENT status pill already says everything there
  // is to say about that case).
  const departureNotePillLabel =
    display.isTransactionDeparture && statusLabel === "FREE AGENT" && /released/i.test(lastTransactionType)
      ? ["RELEASED", lastTransactionDateLabel].filter(Boolean).join(" ")
      : "";

  // Third chip slot: 40-MAN roster note, the RELEASED note, or nothing at
  // all. Mutually exclusive by definition — a player can't be on the
  // 40-man roster and released at the same time.
  const thirdChip = showFortyManPill
    ? { label: fortyManPillLabel, title: fortyManPillTitle, className: "front-chip front-chip--forty-man" }
    : departureNotePillLabel
      ? { label: departureNotePillLabel, title: "Last transaction", className: "front-chip front-chip--departure-note" }
      : null;

  const nextGameStatusLabelRaw = asText(p.next_game_status_label);
  const nextGameDate = asText(p.next_game_date);
  const nextGameHomeAway = formatOpponentPrefix(asText(p.next_game_home_away));
  const nextGameOpponent = asText(p.next_game_opponent);
  const nextGameTimeLocal = asText(p.next_game_time_local);
  const nextGameTimeUtc = asDateTimeText(p.next_game_time_utc);
  const hsTimeZoneRaw =
    asText(p.school_time_zone) ||
    asText(p.school_timezone) ||
    asText(p.hs_time_zone) ||
    asText(p.next_game_time_zone);

  const hsTimeZone = formatTimeZoneLabel(hsTimeZoneRaw);

  const normalizedStatus = statusLabel.toUpperCase();
  const isNonActiveStatus =
    normalizedStatus === "RETIRED" ||
    normalizedStatus === "NOT ACTIVE" ||
    normalizedStatus === "FREE AGENT" ||
    normalizedStatus === "DFA" ||
    display.isSourcedDeparture;

  const nextGameStatusLabel = nextGameStatusLabelRaw || "NEXT GAME";
  const { dayLine, dateLine } = tryFormatGameDate(
    nextGameDate,
    nextGameTimeUtc,
    hsTimeZoneRaw,
  );
  const nextGameDateLine = dateLine ? `${dayLine} | ${dateLine}` : dayLine;
  const nextGameOpponentLine = nextGameOpponent
    ? `${nextGameHomeAway || "vs."} ${nextGameOpponent}`
    : "TBD";
  const nextGameTimeLine =
    [nextGameTimeLocal, hsTimeZone].filter(Boolean).join(" | ") || "TBD";

  const showNextGameBlock =
    !isNonActiveStatus &&
    !!nextGameStatusLabel &&
    !!nextGameDate &&
    !!nextGameOpponent;

  const accent = getAccentColor(p);
  const accentBorder = getAccentBorderColor(p);

  const chipStyle: CSSProperties = {
    width: "fit-content",
  };

  return (
    <div className="yat-face yat-front yat-front-cq">
      {/* The silhouette is the background; the photo is a lazy <img> on
          top of it (see CardPhoto). It used to be a second background
          layer, which the browser downloaded for every card in the open
          tab whether it was on screen or not. */}
      <div className="yat-bg" style={{ backgroundImage: `url('${thenSilhouetteUrl}')` }}>
        <CardPhoto srcs={photoSrcs} eager={eager} />
      </div>
      <div className="yat-shade" />
      {/* Baseball-card treatment: the inset rule and transparent stacked
          wordmark are decoration only, never interactive hit targets. */}
      <div className="yat-front-print-frame" aria-hidden="true" />
      <img className="yat-front-brand-watermark" src="/img/yatstats-logo-stacked-white.svg" alt="" aria-hidden="true" />
      {/* Favorite him right from the card (top-right corner). */}
      {imageId && (
        <div className="yat-card-fav-slot">
          <FavoriteButton variant="star" playerId={imageId} playerName={[first, last].filter(Boolean).join(" ") || imageId} playerHsid={hsid || asText(p.hsid)} />
        </div>
      )}

      <div className="yat-front-content">
        <div className="yat-front-bottom-row">
          <div className="yat-front-left-meta">
            <div className="yat-name yat-front-name">
              <span>{first || "--"}</span>
              <span>{last || ""}</span>
            </div>

            {displayTeamName && (
              <div className="yat-front-team-name">
                {displayTeamName}
              </div>
            )}

            {displayOrgLine && (
              <div className="yat-front-org-name">
                {displayOrgLine}
              </div>
            )}

            <div className="yat-front-chip-stack">
              <span className={statusLabel === "COMMIT" ? "front-chip front-chip--commit" : "front-chip"} style={chipStyle} title={statusPillLabel}>
                {statusPillLabel}
              </span>

              {thirdChip && (
                <span className={thirdChip.className} style={chipStyle} title={thirdChip.title}>
                  {thirdChip.label}
                </span>
              )}

              {visibleLevelLabel && (
                <span className="front-chip" style={chipStyle}>
                  {isRetired || display.levelIsHighest ? `HIGHEST LEVEL: ${visibleLevelLabel}` : visibleLevelLabel}
                </span>
              )}

              {classOf && (
                <span
                  className={
                    gradClassEstimated
                      ? "front-chip front-chip--estimated"
                      : "front-chip"
                  }
                  style={chipStyle}
                >
                  CLASS OF {classOf}
                </span>
              )}

              {rosterYears.length > 0 && (
                <div className="yat-front-year-dots">
                  {rosterYears.map((y) => (
                    <div key={y} className="yat-dot">
                      {y.slice(-2)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="yat-front-right-meta">
            {showNextGameBlock && (
              <div className="yat-front-next-game">
                <span className="front-chip" style={chipStyle}>
                  {nextGameStatusLabel}
                </span>

                <div className="yat-front-next-game-text">
                  <span>{nextGameDateLine}</span>
                  <span>{nextGameOpponentLine}</span>
                  <span>{nextGameTimeLine}</span>
                </div>
              </div>
            )}

            <span
              className="yat-front-flip-button"
              style={{
                background: accent,
                border: `1px solid ${accentBorder}`,
              }}
            >
              <span>FLIP FOR STATS</span>
            </span>
          </div>
        </div>
      </div>

      
    </div>
  );
}
