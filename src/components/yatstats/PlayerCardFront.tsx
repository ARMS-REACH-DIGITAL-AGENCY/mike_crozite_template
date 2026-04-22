"use client";

import type { CSSProperties, MouseEvent, KeyboardEvent } from "react";
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

  return "";
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

  return "#c0c0c0";
}

function formatOpponentPrefix(value: string): string {
  const v = value.trim().toUpperCase();
  if (!v) return "";
  if (v === "AWAY" || v === "@") return "@";
  if (v === "HOME" || v === "vs" || v === "vs.") return "vs.";
  return value.trim();
}

function formatNextGame(player: Record<string, unknown>) {
  const homeAway = formatOpponentPrefix(asText(player.next_game_home_away));
  const opponent = asText(player.next_game_opponent);
  const date = asText(player.next_game_date);
  const time = asText(player.next_game_time_local);

  const tz =
    asText(player.next_game_time_zone) ||
    asText(player.school_time_zone) ||
    asText(player.school_timezone) ||
    asText(player.hs_time_zone) ||
    "";

  const opponentLine =
    opponent && homeAway ? `${homeAway} ${opponent}` : opponent || "TBD";

  const timeLine = [time, tz].filter(Boolean).join(" | ");
  const fallbackTimeLine = date || "TBD";

  return {
    opponentLine,
    timeLine: timeLine || fallbackTimeLine,
  };
}

function triggerFlipFromChild(target: HTMLElement) {
  const flipRoot = target.closest(
    '[data-flip-card], .flip-card, .player-card, .yat-card, .yat-flip-card'
  ) as HTMLElement | null;

  if (flipRoot) {
    flipRoot.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      })
    );
    return;
  }

  const clickableParent = target.parentElement as HTMLElement | null;
  if (clickableParent) {
    clickableParent.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      })
    );
  }
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

  const currentTeamName = asText(player.current_team_name) || "--";
  const currentOrgOrConferenceName = asText(player.current_org_or_conference_name);

  const levelLabel = asText(player.level_label) || asText(player.level) || "--";
  const statusLabel =
    asText(player.status_label) || (player.stat_year || player.pitch_year ? "ACTIVE" : "--");
  const classOf = asText(player.class_of);
  const rosterYears = asTextArray(player.roster_years);

  const { opponentLine, timeLine } = formatNextGame(player);

  const accent = getAccentColor(player);
const accentBorder = getAccentBorderColor(player);
const useSchoolAccent = Boolean(accent);

  const yearDotStyle: CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: "#fff",
    color: "#111",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 900,
    lineHeight: 1,
    boxShadow: "0 1px 4px rgba(0,0,0,0.24)",
  };

  const handleFlipClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    triggerFlipFromChild(e.currentTarget);
  };

  const handleFlipKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      triggerFlipFromChild(e.currentTarget);
    }
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
    left: 0,
    right: 0,
    bottom: 0,
    top: "auto",
    height: "58%",
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.50) 0%, 10%, rgba(0,0,0,0.55) 20%, rgba(0,0,0,0.60) 30%, rgba(0,0,0,0.65) 40%, rgba(0,0,0,0.70) 50%), rgba(0,0,0,0.75) 60%, rgba(0,0,0,0.80) 70%, rgba(0,0,0,0.85) 80%, rgba(0,0,0,0.95) 90%, rgba(0,0,0,0.99) 100%)",
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
          padding: "12px 12px 10px",
          color: "#fff",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <div
            style={{
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 2,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 0,
                lineHeight: 0.88,
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
                marginTop: 2,
                fontSize: 13,
                fontWeight: 800,
                lineHeight: 1.06,
                color: "rgba(255,255,255,0.98)",
                textShadow: "0 1px 6px rgba(0,0,0,0.35)",
              }}
            >
              {currentTeamName}
            </div>

            {currentOrgOrConferenceName && (
              <div
                style={{
                  marginTop: 0,
                  fontSize: 10,
                  fontWeight: 500,
                  lineHeight: 1.06,
                  color: "rgba(255,255,255,0.90)",
                  textShadow: "0 1px 5px rgba(0,0,0,0.28)",
                }}
              >
                {currentOrgOrConferenceName}
              </div>
            )}

            <div
              style={{
                marginTop: 5,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 4,
              }}
            >
            <span className="front-chip">{levelLabel}</span>
<span className="front-chip">{statusLabel}</span>

{classOf && <span className="front-chip">CLASS OF {classOf}</span>}

              {rosterYears.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: 5,
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
          </div>

          <div
            style={{
              minWidth: 92,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              justifyContent: "flex-end",
              gap: 5,
            }}
          >
           <span className="front-chip">NEXT GAME</span>

            <div
              style={{
                textAlign: "right",
                fontSize: 12,
                fontWeight: 800,
                lineHeight: 1.08,
                color: "#fff",
                textShadow: "0 1px 6px rgba(0,0,0,0.35)",
              }}
            >
              {opponentLine}
            </div>

            <div
              style={{
                textAlign: "right",
                fontSize: 10,
                fontWeight: 600,
                lineHeight: 1.08,
                color: "rgba(255,255,255,0.92)",
                textShadow: "0 1px 5px rgba(0,0,0,0.3)",
              }}
            >
              {timeLine}
            </div>

            <button
              type="button"
              onClick={handleFlipClick}
              onKeyDown={handleFlipKeyDown}
              style={{
  appearance: "none",
  border: useSchoolAccent ? `1px solid ${accentBorder}` : "1px solid rgba(255,255,255,0.42)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  minHeight: 26,
  padding: "0 10px",
  borderRadius: 6,
  background: useSchoolAccent ? accent : "rgba(255,255,255,0.10)",
  color: "#fff",
  fontSize: 10,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  boxShadow: "0 2px 8px rgba(0,0,0,0.24)",
  cursor: "pointer",
  marginTop: 2,
}}
              aria-label="Flip for stats"
            >
              <span>FLIP FOR STATS</span>
              <span aria-hidden="true">&gt;&gt;&gt;</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
