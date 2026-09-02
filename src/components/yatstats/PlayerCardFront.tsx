import { CSSProperties } from "react";
import { getPlayerThenImageUrl, getThenSilhouetteUrl } from "@/lib/playerImage";

interface PlayerCardFrontProps {
  player: Record<string, unknown>;
  frontImageUrl?: string | null;
  isAllTime?: boolean;
  /** When true, the grad class year is estimated (derived from TBC playyears), not verified by school. */
  gradClassEstimated?: boolean;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

function getFallbackStatusLabel(player: Record<string, unknown>): string {
  const battingYear = asNumber(player.stat_year);
  const pitchingYear = asNumber(player.pitch_year);
  const latestYear = Math.max(battingYear ?? 0, pitchingYear ?? 0);

  if (latestYear >= 2026) return "ACTIVE";
  if (latestYear === 2025) return "NOT ACTIVE";
  return "RETIRED";
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

  const committedTeamName = asText(player.committed_team_name);

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
}: PlayerCardFrontProps) {
  const imageId = String(p.playerid || "");
  const isPitcher = p.is_pitcher === true;

  const thenSilhouetteUrl = getThenSilhouetteUrl({
    isPitcher,
    bats: p.bats,
    throws: p.throws,
  });
  const photoUrl = normalizeImageUrl(frontImageUrl) || getPlayerThenImageUrl(imageId);
  const frontBackgroundImage = `url('${photoUrl}'), url('${thenSilhouetteUrl}')`;

  const { first, last } = formatNameParts(p);

  const classOf = asText(p.class_of);
  const rosterYears = asTextArray(p.roster_years);

  const statusLabelRaw =
    asText(p.display_status_label) ||
    asText(p.status_label) ||
    getFallbackStatusLabel(p);

  const levelLabelRaw =
    asText(p.display_level_label) ||
    asText(p.level_label) ||
    asText(p.level) ||
    "--";

  const statusLabel = statusLabelRaw.toUpperCase();
  const levelLabel = levelLabelRaw.toUpperCase();
  const showFortyManPill = asBoolean(p.is_on_40man);
  const visibleLevelLabel = showFortyManPill
    ? levelLabel.replace(/\s*\(?40-MAN\)?\s*/g, " ").replace(/\s{2,}/g, " ").trim() || levelLabel
    : levelLabel;
  const fortyManOrgName = asText(p.forty_man_org_name);
  const fortyManOrgAbbr = asText(p.forty_man_org_abbr);
  const fortyManPillTitle = fortyManOrgName
    ? `${fortyManOrgName} 40-man roster`
    : "MLB 40-man roster";
  const fortyManPillLabel = fortyManOrgAbbr ? `${fortyManOrgAbbr} 40-MAN` : "40-MAN";

  const currentTeamName = asText(p.current_team_name) || "--";
  const currentOrgOrConferenceName = asText(p.current_org_or_conference_name);
  const previousTeamName = asText(p.previous_team_name);
  const previousOrgOrConferenceName = asText(p.previous_org_or_conference_name);

  // Sourced-fact override: when the transactions pipeline has confirmed a
  // player is FREE AGENT/RETIRED, show his last real team/org exactly like
  // every other card does (previous_team_name/previous_org_or_conference_name
  // — the same columns the site's existing retired-player rows already use),
  // not a stale current_team_name. The specific transaction fact (type +
  // date) doesn't replace those lines; it's a note in the 40-MAN chip's
  // slot instead (see departureNotePillLabel below) — a player can't be on
  // the 40-man roster and released at the same time, so the two never
  // collide. See scripts/apply-mlb-transaction-status.ts and
  // scripts/refresh-flip-card-front-stage-from-mlb.ts (flagRosterAbsences).
  const teamAffiliationStatus = asText(p.team_affiliation_status).toUpperCase();
  const lastTransactionType = asText(p.last_transaction_type);
  const lastTransactionDateLabel = formatTransactionDate(p.last_transaction_date);

  const isSourcedDeparture =
    (teamAffiliationStatus === "FREE AGENT" || teamAffiliationStatus === "RETIRED") &&
    !!lastTransactionType;

  const displayTeamName = isSourcedDeparture
    ? previousTeamName || currentTeamName
    : currentTeamName;

  const displayOrgLine = isSourcedDeparture
    ? previousOrgOrConferenceName
    : currentOrgOrConferenceName;

  const statusPillLabel = isSourcedDeparture
    ? teamAffiliationStatus
    : formatCommitStatusLabel(p, statusLabel);

  // RETIRED is a status (shown via statusPillLabel above, alongside
  // ACTIVE/FREE AGENT) — it does NOT belong in this note slot. This slot
  // is exclusively for the RELEASED note, which only applies to a FREE
  // AGENT card whose terminal transaction was specifically a release
  // (not e.g. MLB's "Declared Free Agency" type, which has no note of
  // its own — the FREE AGENT status pill already says everything there
  // is to say about that case).
  const departureNotePillLabel =
    isSourcedDeparture && teamAffiliationStatus === "FREE AGENT" && /released/i.test(lastTransactionType)
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
    isSourcedDeparture;

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
      <div
        className="yat-bg"
        data-src={photoUrl}
        data-placeholder={thenSilhouetteUrl}
        style={{ backgroundImage: frontBackgroundImage }}
      />
      <div className="yat-shade" />

      <div className="yat-front-content">
        <div className="yat-front-bottom-row">
          <div className="yat-front-left-meta">
            <div className="yat-name yat-front-name">
              <span>{first || "--"}</span>
              <span>{last || ""}</span>
            </div>

            <div className="yat-front-team-name">
              {displayTeamName}
            </div>

            {displayOrgLine && (
              <div className="yat-front-org-name">
                {displayOrgLine}
              </div>
            )}

            <div className="yat-front-chip-stack">
              <span className={statusLabel === "COMMIT" ? "front-chip front-chip--commit" : "front-chip"} style={chipStyle} title={statusPillLabel}>
                {statusPillLabel}
              </span>

              <span className="front-chip" style={chipStyle}>
                {visibleLevelLabel}
              </span>

              {thirdChip && (
                <span className={thirdChip.className} style={chipStyle} title={thirdChip.title}>
                  {thirdChip.label}
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
              <span aria-hidden="true">&gt;</span>
            </span>
          </div>
        </div>
      </div>

      <style>{`
        .yat-front-cq {
          container-type: inline-size;
          container-name: yat-front;
        }

        .yat-front-content {
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: clamp(9px, 4.5cqi, 14px) clamp(8px, 3.8cqi, 12px) clamp(8px, 3.8cqi, 12px);
        }

        .yat-front-bottom-row {
          width: 100%;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(84px, 36%);
          align-items: end;
          gap: clamp(6px, 3cqi, 12px);
        }

        .yat-front-left-meta,
        .yat-front-right-meta {
          min-width: 0;
          display: flex;
          flex-direction: column;
        }

        .yat-front-left-meta {
          align-items: flex-start;
          gap: 0;
        }

        .yat-front-right-meta {
          align-items: flex-end;
          justify-content: flex-end;
          gap: clamp(3px, 1.7cqi, 5px);
        }

        .yat-front-name {
          font-family: Indigo, "Bebas Neue", sans-serif;
          font-size: clamp(22px, 13.5cqi, 42px);
          line-height: 0.86;
          text-transform: uppercase;
          text-shadow: 0 2px 10px rgba(0,0,0,0.48);
          max-width: 100%;
          overflow-wrap: normal;
          word-break: normal;
        }

        .yat-front-name span {
          display: block;
          max-width: 100%;
        }

        .yat-front-team-name {
          margin-top: clamp(2px, 1.2cqi, 4px);
          max-width: 100%;
          font-size: clamp(8px, 4cqi, 13px);
          font-weight: 700;
          line-height: 1.02;
          color: rgba(255,255,255,0.96);
          text-shadow: 0 1px 6px rgba(0,0,0,0.35);
          overflow-wrap: anywhere;
        }

        .yat-front-org-name {
          margin-top: 1px;
          max-width: 100%;
          font-size: clamp(7px, 3cqi, 10px);
          font-weight: 400;
          line-height: 1.03;
          color: rgba(255,255,255,0.82);
          text-shadow: 0 1px 5px rgba(0,0,0,0.28);
          overflow-wrap: anywhere;
        }

        .yat-front-chip-stack {
          margin-top: clamp(4px, 2.2cqi, 6px);
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: clamp(2px, 1.2cqi, 3px);
          max-width: 100%;
        }

        .yat-front-chip-stack .front-chip,
        .yat-front-next-game .front-chip {
          display: inline-block;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: clamp(7px, 3cqi, 10px);
          line-height: 1;
          padding: clamp(3px, 1.2cqi, 5px) clamp(5px, 2.1cqi, 8px);
        }

        .yat-front-chip-stack .front-chip--commit {
          max-width: min(100%, 210px);
        }

        .yat-front-chip-stack .front-chip--forty-man {
          background: rgba(10, 132, 255, 0.82);
          border-color: rgba(160, 210, 255, 0.72);
          color: #fff;
          letter-spacing: 0.04em;
        }

        .yat-front-year-dots {
          display: flex;
          gap: clamp(2px, 1.2cqi, 4px);
          flex-wrap: wrap;
          margin-top: 1px;
          max-width: 100%;
        }

        .yat-front-year-dots .yat-dot {
          width: clamp(17px, 7cqi, 23px);
          height: clamp(17px, 7cqi, 23px);
          font-size: clamp(8px, 3cqi, 11px);
        }

        .yat-front-next-game {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: clamp(2px, 1.2cqi, 5px);
          max-width: 100%;
        }

        .yat-front-next-game-text {
          text-align: right;
          font-size: clamp(7px, 3cqi, 10px);
          font-weight: 700;
          line-height: 1.1;
          color: #fff;
          text-shadow: 0 1px 6px rgba(0,0,0,0.35);
          display: flex;
          flex-direction: column;
          gap: 1px;
          max-width: 100%;
        }

        .yat-front-flip-button {
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          gap: clamp(5px, 2cqi, 8px);
          min-height: clamp(20px, 8cqi, 24px);
          padding: 0 clamp(7px, 3cqi, 10px);
          border-radius: clamp(4px, 2cqi, 6px);
          color: #fff;
          font-size: clamp(8px, 3.2cqi, 10px);
          font-weight: 900;
          line-height: 1;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          box-shadow: 0 2px 8px rgba(0,0,0,0.24);
          margin-top: 2px;
          white-space: nowrap;
          max-width: 100%;
        }

        @container yat-front (max-width: 230px) {
          .yat-front-bottom-row {
            grid-template-columns: minmax(0, 1fr) minmax(72px, 34%);
            gap: 5px;
          }

          .yat-front-name {
            font-size: clamp(19px, 12cqi, 27px);
          }

          .yat-front-team-name {
            font-size: clamp(7px, 3.4cqi, 10px);
          }

          .yat-front-org-name {
            font-size: clamp(6px, 2.8cqi, 8px);
          }

          .yat-front-next-game-text {
            display: none;
          }

          .yat-front-next-game .front-chip {
            font-size: clamp(6px, 2.8cqi, 8px);
            padding: 3px 5px;
          }

          .yat-front-flip-button {
            min-height: 20px;
            padding: 0 7px;
            font-size: 8px;
          }
        }

        @container yat-front (max-width: 190px) {
          .yat-front-content {
            padding: 8px 7px 8px;
          }

          .yat-front-bottom-row {
            grid-template-columns: 1fr;
            gap: 6px;
          }

          .yat-front-right-meta {
            align-items: flex-start;
          }

          .yat-front-next-game {
            display: none;
          }

          .yat-front-name {
            font-size: clamp(19px, 13cqi, 25px);
          }

          .yat-front-flip-button {
            align-self: flex-end;
          }
        }
      `}</style>
    </div>
  );
}
