// src/app/api/og/player-card/route.tsx
// Dynamic Open Graph / Twitter-card image for a single player's flip card,
// used by the Social tab's share links (see FunZone.tsx's shareUrl and
// [hsid]/page.tsx's generateMetadata). Link-preview crawlers (Facebook,
// iMessage, SMS, Slack, etc.) hit this route server-side to fetch the
// preview image - they never execute the client-side flip-card JS, so this
// recreates the front card's photo + name + team + status look as a flat
// 1200x630 PNG rather than depending on any of that runtime behavior.

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getPlayerById, getResolvedCurrentTeam, getDesignatedPlayerImage } from "@/lib/db";
import { getPlayerThenImageUrl, getThenSilhouetteUrl } from "@/lib/playerImage";

export const runtime = "nodejs";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function Chip({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        background: "rgba(255,255,255,0.16)",
        border: "1px solid rgba(255,255,255,0.4)",
        borderRadius: 8,
        padding: "8px 18px",
        color: "#fff",
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

export async function GET(req: NextRequest) {
  const playerId = (req.nextUrl.searchParams.get("playerId") || "").trim();

  let firstName = "";
  let lastName = "";
  let teamName = "";
  let orgLine = "";
  let statusLabel = "";
  let levelLabel = "";
  let classOf = "";
  let photoUrl = "";
  let isPitcher = false;
  let bats: unknown = "";
  let throwsHand: unknown = "";

  if (playerId) {
    try {
      const [player, resolvedCurrentTeam, frontImage] = await Promise.all([
        getPlayerById(playerId),
        getResolvedCurrentTeam(playerId),
        getDesignatedPlayerImage(playerId, "YATSTATS_FRONT"),
      ]);

      firstName = asText(player?.firstname || player?.first_name);
      lastName = asText(player?.lastname || player?.last_name);
      bats = player?.bats;
      throwsHand = player?.throws;
      isPitcher = /pitch/i.test(asText(player?.position));
      teamName = asText(resolvedCurrentTeam?.team_name) || asText(player?.current_team_name);
      orgLine = asText(player?.current_org_or_conference_name);
      statusLabel = asText(player?.status_label).toUpperCase();
      levelLabel = (asText(resolvedCurrentTeam?.level) || asText(player?.level_label)).toUpperCase();
      classOf = asText(player?.class_of);
      photoUrl = asText(frontImage?.image_url);
    } catch {
      // fall through to silhouette below
    }
  }

  if (!photoUrl) photoUrl = playerId ? getPlayerThenImageUrl(playerId) : "";
  const silhouettePath = getThenSilhouetteUrl({ isPitcher, bats, throws: throwsHand });
  const silhouetteUrl = new URL(silhouettePath, req.url).toString();


  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "1200px",
          height: "630px",
          position: "relative",
          backgroundColor: "#15110d",
        }}
      >
        <img
          src={photoUrl || silhouetteUrl}
          width={1200}
          height={630}
          style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "linear-gradient(180deg, rgba(0,0,0,0) 38%, rgba(0,0,0,0.55) 68%, rgba(0,0,0,0.92) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 36,
            right: 40,
            display: "flex",
            alignItems: "center",
            background: "rgba(0,0,0,0.55)",
            padding: "10px 20px",
            borderRadius: 10,
          }}
        >
          <span style={{ color: "#fff", fontSize: 26, fontWeight: 800, letterSpacing: 2 }}>
            YAT?STATS
          </span>
        </div>
        <div
          style={{
            position: "absolute",
            left: 56,
            right: 56,
            bottom: 48,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 76,
              fontWeight: 800,
              color: "#fff",
              textTransform: "uppercase",
              lineHeight: 0.98,
              maxWidth: 1000,
            }}
          >
            <span style={{ display: "flex" }}>{firstName || "YAT?STATS"}</span>
            {lastName && <span style={{ display: "flex" }}>{lastName}</span>}
          </div>
          {teamName && (
            <div style={{ display: "flex", marginTop: 18, fontSize: 34, fontWeight: 700, color: "rgba(255,255,255,0.96)" }}>
              {teamName}
            </div>
          )}
          {orgLine && (
            <div style={{ display: "flex", marginTop: 4, fontSize: 24, color: "rgba(255,255,255,0.78)" }}>
              {orgLine}
            </div>
          )}
          <div style={{ display: "flex", gap: 14, marginTop: 24 }}>
            {statusLabel && <Chip>{statusLabel}</Chip>}
            {levelLabel && <Chip>{levelLabel}</Chip>}
            {classOf && <Chip>{`CLASS OF ${classOf}`}</Chip>}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
