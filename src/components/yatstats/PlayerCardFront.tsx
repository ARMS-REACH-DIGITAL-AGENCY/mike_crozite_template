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
  november: 10,
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

  // Prefer the real UTC timestamp and the same local timezone shown on the card.
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

  // Backend may send: TODAY | April 27, 2026
  if (raw.toUpperCase().startsWith("TODAY |")) {
    const datePart = raw.split("|").slice(1).join("|").trim();
    return formatDatePart(datePart) || { dayLine: "TODAY", dateLine: datePart };
  }

  // Backend may send: Monday | April 27, 2026
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

export default function PlayerCardFront({
  player: p,
  frontImageUrl = null,
  gradClassEstimated = false,
}: PlayerCardFrontProps) {
  const imageId = String(p.playerid || "");
  const isPitcher = p.is_pitcher === true;

  const photoUrl = frontImageUrl || getPlayerThenImageUrl(imageId);
  const thenSilhouetteUrl = getThenSilhouetteUrl(isPitcher);

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

  const currentTeamName = asText(p.current_team_name) || "--";
  const currentOrgOrConferenceName = asText(p.current_org_or_conference_name);

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
    normalizedStatus === "FREE AGENT";

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
    <div className="yat-face yat-front">
      <div
        className="yat-bg"
        data-src={photoUrl}
        data-placeholder={thenSilhouetteUrl}
        style={{ backgroundImage: `url('${photoUrl}')` }}
      />
      <div className="yat-shade" />

      <div
        className="yat-front-content"
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "14px 12px 12px",
        }}
      >
        <div
          style={{
            width: "100%",
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) auto",
            alignItems: "end",
            gap: 12,
          }}
        >
          <div
            style={{
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 0,
            }}
          >
            <div
              className="yat-name"
              style={{
                fontFamily: 'Indigo, "Bebas Neue", sans-serif',
                fontSize: 30,
                lineHeight: 0.88,
                textTransform: "uppercase",
                textShadow: "0 2px 10px rgba(0,0,0,0.48)",
              }}
            >
              <span>{first || "--"}</span>
              <span>{last || ""}</span>
            </div>

            <div
              style={{
                marginTop: 3,
                fontSize: 13,
                fontWeight: 700,
                lineHeight: 1.04,
                color: "rgba(255,255,255,0.96)",
                textShadow: "0 1px 6px rgba(0,0,0,0.35)",
              }}
            >
              {currentTeamName}
            </div>

            {currentOrgOrConferenceName && (
              <div
                style={{
                  marginTop: 1,
                  fontSize: 10,
                  fontWeight: 400,
                  lineHeight: 1.04,
                  color: "rgba(255,255,255,0.82)",
                  textShadow: "0 1px 5px rgba(0,0,0,0.28)",
                }}
              >
                {currentOrgOrConferenceName}
              </div>
            )}

            <div
              style={{
                marginTop: 6,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 3,
              }}
            >
              <span className="front-chip" style={chipStyle}>
                {statusLabel}
              </span>

              <span className="front-chip" style={chipStyle}>
                {levelLabel}
              </span>

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
                <div
                  style={{
                    display: "flex",
                    gap: 4,
                    flexWrap: "wrap",
                    marginTop: 1,
                  }}
                >
                  {rosterYears.map((y) => (
                    <div key={y} className="yat-dot">
                      {y.slice(-2)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              minWidth: 126,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              justifyContent: "flex-end",
              gap: 5,
            }}
          >
            {showNextGameBlock && (
              <>
                <span className="front-chip" style={chipStyle}>
                  {nextGameStatusLabel}
                </span>

                <div
                  style={{
                    textAlign: "right",
                    fontSize: 10,
                    fontWeight: 700,
                    lineHeight: 1.15,
                    color: "#fff",
                    textShadow: "0 1px 6px rgba(0,0,0,0.35)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <span>{nextGameDateLine}</span>
                  <span>{nextGameOpponentLine}</span>
                  <span>{nextGameTimeLine}</span>
                </div>
              </>
            )}

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                minHeight: 24,
                padding: "0 10px",
                borderRadius: 6,
                background: accent,
                border: `1px solid ${accentBorder}`,
                color: "#fff",
                fontSize: 10,
                fontWeight: 900,
                lineHeight: 1,
                letterSpacing: "0.03em",
                textTransform: "uppercase",
                boxShadow: "0 2px 8px rgba(0,0,0,0.24)",
                marginTop: 2,
                whiteSpace: "nowrap",
              }}
            >
              <span>FLIP FOR STATS</span>
              <span aria-hidden="true">&gt;</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
