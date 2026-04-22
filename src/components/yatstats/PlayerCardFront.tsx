import { getPlayerThenImageUrl, getThenSilhouetteUrl } from "@/lib/playerImage";

interface PlayerCardFrontProps {
  player: Record<string, unknown>;
  frontImageUrl?: string | null;
  isAllTime?: boolean;
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
  if (v === "HOME" || v === "VS" || v === "VS.") return "VS.";
  return value.trim();
}

function formatNextGameLine(player: Record<string, unknown>): string {
  const homeAway = formatOpponentPrefix(asText(player.next_game_home_away));
  const opponent = asText(player.next_game_opponent);
  const date = asText(player.next_game_date);
  const time = asText(player.next_game_time_local);

  const opponentSegment =
    opponent && homeAway ? `${homeAway} ${opponent}` : opponent || "";

  const parts = [opponentSegment, date, time].filter(Boolean);

  if (parts.length === 0) return "NEXT GAME TBD";
  return `NEXT GAME ${parts.join(" | ")}`;
}

export default function PlayerCardFront({
  player,
  frontImageUrl = null,
}: PlayerCardFrontProps) {
  const imageId = String(player.playerid || "");
  const isPitcher = player.is_pitcher === true;

  const photoUrl = frontImageUrl || getPlayerThenImageUrl(imageId);
  const thenSilhouetteUrl = getThenSilhouetteUrl(isPitcher);

  const { first, last } = formatNameParts(player);

  const currentTeamName = asText(player.current_team_name);
  const currentOrgOrConferenceName = asText(player.current_org_or_conference_name);
  const levelLabel = asText(player.level_label) || asText(player.level) || "--";
  const statusLabel =
    asText(player.status_label) || (player.stat_year || player.pitch_year ? "ACTIVE" : "--");
  const classOf = asText(player.class_of);
  const rosterYears = asTextArray(player.roster_years);
  const nextGameLine = formatNextGameLine(player);

  const teamLine =
    [currentTeamName, currentOrgOrConferenceName].filter(Boolean).join(" | ") || "--";

  const pillStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 24,
    padding: "0 10px",
    borderRadius: 999,
    background: "rgba(17,17,17,0.82)",
    border: "1px solid rgba(255,255,255,0.16)",
    color: "#fff",
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    boxShadow: "0 2px 8px rgba(0,0,0,0.28)",
  };

  const yearDotStyle: React.CSSProperties = {
    width: 30,
    height: 30,
    borderRadius: "50%",
    background: "#fff",
    color: "#111",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 900,
    lineHeight: 1,
    boxShadow: "0 2px 6px rgba(0,0,0,0.28)",
  };

  return (
    <div
      className="yat-face yat-front"
      style={{
        position: "relative",
        overflow: "hidden",
        height: "100%",
        minHeight: 0,
        background: "#111",
      }}
    >
      <div
        className="yat-bg"
        data-src={photoUrl}
        data-placeholder={thenSilhouetteUrl}
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url('${photoUrl}')`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
        }}
      />

      <div
        className="yat-shade"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.12) 24%, rgba(0,0,0,0.26) 54%, rgba(0,0,0,0.78) 100%)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "14px 14px 12px",
          color: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 7,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
              lineHeight: 0.9,
              textTransform: "uppercase",
              fontWeight: 900,
              letterSpacing: "0.01em",
              textShadow: "0 2px 10px rgba(0,0,0,0.48)",
            }}
          >
            <span style={{ fontSize: 22 }}>{first}</span>
            <span style={{ fontSize: 22 }}>{last}</span>
          </div>

          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.15,
              color: "rgba(255,255,255,0.96)",
              textShadow: "0 1px 6px rgba(0,0,0,0.35)",
            }}
          >
            {teamLine}
          </div>

          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span style={pillStyle}>{levelLabel}</span>
            <span style={pillStyle}>{statusLabel}</span>
          </div>

          {classOf && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 6,
              }}
            >
              <span style={pillStyle}>CLASS OF {classOf}</span>

              {rosterYears.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  {rosterYears.map((y) => (
                    <div key={y} style={yearDotStyle}>
                      {y.slice(-2)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            style={{
              appearance: "none",
              border: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              minHeight: 34,
              padding: "0 14px",
              borderRadius: 999,
              background: "#00e36f",
              color: "#06140b",
              fontSize: 13,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              boxShadow: "0 4px 14px rgba(0,0,0,0.24)",
              cursor: "pointer",
            }}
            aria-label="Flip for stats"
          >
            <span>FLIP FOR STATS</span>
            <span aria-hidden="true">→</span>
          </button>

          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              lineHeight: 1.15,
              color: "#fff",
              textShadow: "0 1px 6px rgba(0,0,0,0.35)",
            }}
          >
            {nextGameLine}
          </div>
        </div>
      </div>
    </div>
  );
}
