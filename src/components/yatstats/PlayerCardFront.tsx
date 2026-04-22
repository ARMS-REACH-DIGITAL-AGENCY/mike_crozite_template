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

function asTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
  }
  return [];
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

function tryFormatGameDate(value: string) {
  if (!value) return { dayLine: "TBD", dateLine: "" };

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      dayLine: parsed.toLocaleDateString("en-US", { weekday: "long" }),
      dateLine: parsed.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    };
  }

  return { dayLine: value, dateLine: "" };
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

  const statusLabel =
    asText(p.status_label) || (p.stat_year || p.pitch_year ? "ACTIVE" : "--");
  const levelLabel = asText(p.level_label) || asText(p.level) || "--";

  const currentTeamName = asText(p.current_team_name) || "--";
  const currentOrgOrConferenceName = asText(p.current_org_or_conference_name);

  const nextGameDate = asText(p.next_game_date);
  const nextGameHomeAway = formatOpponentPrefix(asText(p.next_game_home_away));
  const nextGameOpponent = asText(p.next_game_opponent) || "TBD";
  const nextGameTimeLocal = asText(p.next_game_time_local);
  const hsTimeZone =
    asText(p.school_time_zone) ||
    asText(p.school_timezone) ||
    asText(p.hs_time_zone) ||
    asText(p.next_game_time_zone);

  const { dayLine, dateLine } = tryFormatGameDate(nextGameDate);
  const nextGameDateLine = dateLine ? `${dayLine} | ${dateLine}` : dayLine;
  const nextGameOpponentLine =
    nextGameOpponent === "TBD"
      ? "TBD"
      : `${nextGameHomeAway || "vs."} ${nextGameOpponent}`;
  const nextGameTimeLine =
    [nextGameTimeLocal, hsTimeZone].filter(Boolean).join(" | ") || "TBD";

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
                {levelLabel}
              </span>

              <span className="front-chip" style={chipStyle}>
                {statusLabel}
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
            <span className="front-chip" style={chipStyle}>
              NEXT GAME
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
