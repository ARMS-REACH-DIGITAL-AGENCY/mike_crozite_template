import SponsorTower from '@/components/yatstats/SponsorTower';
import { publicNewsHeadline } from '@/lib/newsVideo';
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
  getSchoolByHsid,
  getSchoolByUrl,
  getFlipCardTransactionStatus,
  getNewsByPlayer,
  getPlayerSocialHandles,
  query,
} from "@/lib/db";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { playerProfileShareInfo, playerShareOrigin } from "@/lib/playerProfileShare";
import { storyAssetUrl } from "@/lib/storyAssets";
import ProfileNewsList, { type ProfileNewsStory } from "@/components/yatstats/ProfileNewsList";
import StoriesFeed from "@/components/yatstats/StoriesFeed";
import WhereYatProfilePanel from "@/components/yatstats/WhereYatProfilePanel";
import PlayerInstagramFeed from "@/components/yatstats/PlayerInstagramFeed";
import { mlbTeamLogoUrl, resolveScheduleTeamId, toISODate, formatDisplayDate, shiftIsoDate, levelLabel } from "@/lib/playerUtils";
import { getTeamLogoUrl, getOriginalForCardCopy, chooseNewsDisplayImage } from "@/lib/playerImage";
import ProfileGameLogLoader from "@/components/yatstats/ProfileGameLogLoader";
import { preload } from "react-dom";
type Props = {
  params: Promise<{
    hsid: string;
    playerId: string;
    slug: string;
  }>;
};

// Ordinary profile URLs must have their own preview. Previously this page
// returned {}, so the school-level title/crest was all a text app could see.
async function defaultPlayerShareMetadata(hsid: string, playerId: string, slug: string): Promise<Metadata> {
  const h = await headers();
  const origin = playerShareOrigin(h.get('x-forwarded-host') || h.get('host') || '', h.get('x-forwarded-proto') || 'https');
  const [player, byIdSchool] = await Promise.all([
    getPlayerById(playerId).catch(() => null),
    /^\d+$/.test(hsid) ? getSchoolByHsid(hsid).catch(() => null) : Promise.resolve(null),
  ]);
  const school = byIdSchool || await getSchoolByUrl(origin).catch(() => null);
  const resolvedHsid = String(school?.hsid || hsid);
  const playerName = [player?.firstname || player?.first_name, player?.lastname || player?.last_name]
    .filter(Boolean).join(' ').trim() || slug.replace(/-/g, ' ');
  const info = playerProfileShareInfo({
    origin, hsid: resolvedHsid, playerId, slug, playerName,
    schoolName: String(school?.hsname || player?.high_school || ''),
  });
  return {
    title: info.title,
    description: info.description,
    alternates: { canonical: info.url },
    openGraph: {
      type: 'profile', siteName: 'YAT?STATS', url: info.url,
      title: info.title, description: info.description,
      images: [{ url: info.image, width: 1200, height: 630, alt: playerName + ' baseball career timeline' }],
    },
    twitter: {
      card: 'summary_large_image', title: info.title, description: info.description,
      images: [info.image],
    },
  };
}

const SHARE_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// A shared story link (?story=<id>, from the Share button) previews as that
// story in texts and social apps: its first photo, "<Player> · <Month Year>"
// and the start of the story, instead of the school's crest.
export async function generateMetadata({
  params,
  searchParams,
}: Props & { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const { hsid, playerId, slug } = await params;
  const storyParam = (await searchParams)?.story;
  const storyId = typeof storyParam === 'string' && /^\d{1,18}$/.test(storyParam) ? storyParam : null;
  if (!storyId) return defaultPlayerShareMetadata(hsid, playerId, slug);
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
    if (!r) return defaultPlayerShareMetadata(hsid, playerId, slug);
    const month = r.photo_taken_date ? Number(r.photo_taken_date.slice(5, 7)) : 0;
    const when = [month ? SHARE_MONTHS[month - 1] : '', r.photo_taken_year || ''].filter(Boolean).join(' ');
    const player = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || 'Player';
    const title = when ? `${player} · ${when}` : player;
    // Keep the actual story untouched. Rich link previews need a concise
    // teaser, not the full caption, hashtags, extra URLs or author boilerplate.
    const text = String(r.caption || '')
      .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
      .replace(/#[\p{L}\p{N}_]+/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
    const maxPreviewLength = 96;
    const shortened = text.length > maxPreviewLength
      ? text.slice(0, maxPreviewLength - 1).replace(/\s+\S*$/, '').replace(/[.,;:!\-]+$/, '') + '…'
      : text;
    const description = shortened || 'Explore this baseball memory on YAT?STATS.';
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
    return defaultPlayerShareMetadata(hsid, playerId, slug);
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
    // Primary: the playerid in the URL - one index lookup. (The slug lookup
    // scans every player's name, which the database runs as a parallel scan;
    // when it can't start a parallel worker the whole profile failed with
    // "parallel worker failed to initialize".)
    const byId = await getPlayerById(String(playerId));
    _diagFallbackResult = byId ? `GOT: ${byId.firstname} ${byId.lastname}` : "NULL";
    player = byId;
    // Fallback: the slug, scoped to the school (an id with no player row).
    if (!player) {
      const matches = await findPlayersBySlug(slug, hsid);
      _diagSlugRows = matches?.length ?? 0;
      player = matches?.find((p: any) => String(p.playerid) === String(playerId)) ?? null;
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
  // A coach profile may show the school's official Instagram account.
  // Resolve ownership by player role, requested school and an active school
  // source; never identify a profile by its player ID or hardcode a school.
  const coachAtSchool = String(player.status_label || '').trim().toUpperCase() === 'COACH'
    && String(player.hsid || '') === String(hsid);
  const schoolInstagramFeed: { hsid: string; name: string } | undefined = coachAtSchool
    ? await query<{ school_name: string | null }>(
        `SELECT NULLIF(TRIM(t.hsname), '') AS school_name
           FROM public.social_sources s
           LEFT JOIN public.tbc_schools_raw t ON t.hsid::text = s.hsid
          WHERE s.hsid = $1 AND s.owner_type = 'school'
            AND s.platform = 'instagram' AND s.status = 'active'
          LIMIT 1`,
        [String(hsid)],
      ).then(({ rows }) => rows.length
        ? { hsid: String(hsid), name: rows[0].school_name || 'School Baseball' }
        : undefined).catch(() => undefined)
    : undefined;

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
    title: publicNewsHeadline(row.title, row.url, row.discovery_source === "contribute", row.gallery_front_json?.headline),
    url: row.url,
    source: row.source_full ?? row.source ?? null,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    recap: row.tagged_to_player ? null : playerCentricRecap(row),
    whyLocal: row.gallery_back_json?.why_local ?? null,
    imageUrl: chooseNewsDisplayImage({
      playerId: row.associated_playerid ?? row.playerid,
      playerName: row.associated_player_name || playerNewsFullName,
      displayImageUrl: row.display_image_url,
      sourceImageUrl: row.image_url,
      verificationStatus: row.verification_status,
      imageVerificationStatus: row.image_verification_status,
    }),
    newsworthiness: String(row.newsworthiness || "NORMAL").toUpperCase(),
    playerId: safePlayerId,
    playerName: playerNewsFullName,
    tease:
      row.tease_json?.body ??
      row.summary ??
      null,
  }));

  const firstName = (player.firstname || "").trim();
  const lastName = (player.lastname || "").trim();
  const displayName = `${firstName} ${lastName}`.trim() || safePlayerId;

  // Staging-first: the player profile's initial response does not request
  // historical TBC seasons, aggregate career views, or team schedules.
  // The Stats and Game Log tabs each load their own data upon activation.
  const [transactionStatus, socialHandles] = await Promise.all([
    getFlipCardTransactionStatus(safePlayerId),
    getPlayerSocialHandles(safePlayerId),
  ]);
  const isRetiredAlumnus = /RETIRED/i.test(String(
    transactionStatus?.status_label || player.status_label || ""
  ));

  // ── Social handles ────────────────────────────────────────────────────────────

  const xHandle = (socialHandles.x || socialHandles.twitter || player.x_handle || player.twitter_handle || "").replace(/^@/, "");
  const igHandle = (socialHandles.instagram || player.ig_handle || player.instagram_handle || "").replace(/^@/, "");

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
          {isRetiredAlumnus
            ? <WhereYatProfilePanel playerId={safePlayerId} hsid={hsid} name={displayName} />
            : <ProfileGameLogLoader playerId={safePlayerId} />}
        </div>
        {/* The Stats tab content is injected by the existing canonical
            ProfileStatsInjector after activation; don't render a competing
            table or re-query the all-seasons views on first paint. */}
        <div id="ppTab-stats" className="pp-fz-panel">
          <div className="pp-fz-placeholder">Select Stats to load season statistics.</div>
        </div>

        {/* ── NEWS tab ─────────────────────────────────────────────────────── */}
        <div id="ppTab-news" className="pp-fz-panel">
          <div className="yp-profile-partner-columns">
            <div className="yp-profile-partner-body">
              <ProfileNewsList stories={newsStories} firstName={firstName} playerId={safePlayerId} playerName={playerNewsFullName} hsid={hsid} />
              <aside className="yp-profile-infeed-ad" aria-label="Player Profile Partner in-feed advertisement">
                <span>PLAYER PROFILE PARTNER</span><strong>ADVERTISER PLACEMENT</strong><small>IN-FEED SPONSOR CARD · MATCHES STORY WIDTH</small>
              </aside>
            </div>
            <SponsorTower placement="player-news" className="yp-profile-ad" />
          </div>
        </div>

        {/* ── SOCIAL tab ───────────────────────────────────────────────────── */}
        <div id="ppTab-social" className="pp-fz-panel">
          {/* All player feeds use the same ordering as the approved Hamilton
              coach view: Instagram first, compact #YATABOY signoff below.
              Previously only Greg Bordes received this layout, leaving
              Roch Cholowsky and other players with a large header above
              their feed. With no posts, the empty feed hides itself and
              the signoff still remains available. */}
          <PlayerInstagramFeed
            playerId={safePlayerId}
            firstName={firstName}
            schoolFeed={schoolInstagramFeed}
          />
          <div className="pp-social-signoff">
            <span>#YATABOY</span> <span>Show some love for {firstName}!</span>
          </div>
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
            {!xHandle && !igHandle && !schoolInstagramFeed && (
              <div className="pp-fz-placeholder">
                <i className="ri-share-line pp-ph-icon" />
                <p>Social links will appear here once available.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── CONNECT tab ──────────────────────────────────────────────────── */}
        <div id="ppTab-connect" className="pp-fz-panel">
          <div className="yp-profile-partner-columns">
            <div className="yp-profile-partner-body yp-profile-partner-connect">
              <div className="yp-player-video-placeholder" role="img" aria-label="Player video invitation placeholder">
                <i className="ri-play-circle-line" aria-hidden="true" />
                <strong>A PERSONAL MESSAGE FROM {firstName.toUpperCase()}</strong>
                <span>PLAYER VIDEO PREVIEW COMING SOON</span>
              </div>
              <p>Active and retired players can invite their fans to connect through personalized video messages.</p>
              <a className="yp-player-video-link" href={`/${hsid}/connect-contribute#cc-connect`}>LEARN ABOUT VIDEO EXCHANGES →</a>
              <aside className="yp-profile-infeed-ad" aria-label="Player Profile Partner in-feed advertisement">
                <span>PLAYER PROFILE PARTNER</span><strong>ADVERTISER PLACEMENT</strong><small>IN-FEED SPONSOR CARD · MATCHES STORY WIDTH</small>
              </aside>
            </div>
            <SponsorTower placement="player-connect" className="yp-profile-ad" />
          </div>
        </div>

        {/* ── UPLOAD tab ───────────────────────────────────────────────────── */}
        <div id="ppTab-upload" className="pp-fz-panel pp-fz-panel-default">
          <div className="yp-profile-partner-columns">
            <div className="yp-profile-partner-body">
              <StoriesFeed playerId={safePlayerId} playerName={playerNewsFullName} />
            </div>
            <aside className="yp-profile-ad" aria-label="Player Profile Partner advertising placement">
              <span>PLAYER PROFILE PARTNER</span>
              <strong>ADVERTISER<br/>PLACEMENT</strong>
              <small>300 × 600 CREATIVE · SCALES TO FIT</small>
            </aside>
          </div>
        </div>

        {/* The icon row that switches these tabs is rendered by
            ProfileFunZoneStabilizer, pinned above the footer ad. */}

      </section>
      </div>{/* /pp-funzone-outer */}

      {/* ═══════════════════════════════════════════════════════════════════════
          INLINE STYLES — scoped to this page only, no global changes
          ═══════════════════════════════════════════════════════════════════════ */}
      <style>{`

        /* Keep authentic story feeds centered on wider desktops, with a
           readable, full-height tower. The same grid is used on News,
           Connect and Stories without changing the player timeline. */
        #playerFunZone :is(#ppTab-news,#ppTab-connect,#ppTab-upload) .yp-profile-partner-columns {
          width:min(100%,1290px)!important;
          max-width:1290px!important;
          margin:0 auto!important;
          grid-template-columns:minmax(0,1fr) 300px!important;
          gap:20px!important;
          padding-inline:clamp(8px,2vw,25px);
        }
        #playerFunZone .yp-profile-ad {
          color:#efefef!important;
          background:#181818!important;
          border-color:rgba(255,255,255,.53)!important;
          text-shadow:none!important;
        }
        #playerFunZone .yp-profile-ad span {color:#dadada!important;font-size:12px!important;}
        #playerFunZone .yp-profile-ad strong {color:#fff!important;font-size:clamp(22px,2.2vw,33px)!important;}
        #playerFunZone .yp-profile-ad small {color:#d0d0d0!important;font-size:12px!important;}
        body.light-theme #playerFunZone .yp-profile-ad,
        html.light-theme #playerFunZone .yp-profile-ad {
          background:#f1e5cc!important;
          color:#17130b!important;
          border-color:rgba(90,67,35,.65)!important;
        }
        body.light-theme #playerFunZone .yp-profile-ad :is(span,strong,small),
        html.light-theme #playerFunZone .yp-profile-ad :is(span,strong,small) {
          color:#17130b!important;
        }
        @media(max-width:740px) {
          #playerFunZone :is(#ppTab-news,#ppTab-connect,#ppTab-upload) .yp-profile-partner-columns {
            display:flex!important;flex-direction:column!important;
            width:100%!important;max-width:100%!important;
            gap:5px!important;padding:0 5px!important;
          }
          #playerFunZone .yp-profile-ad {
            min-height:68px!important;max-height:86px!important;
            flex-direction:row!important;gap:12px!important;
          }
          #playerFunZone .yp-profile-ad strong {font-size:15px!important;}
          #playerFunZone .yp-profile-ad :is(small,span) {font-size:9px!important;}
        }
        /* Actual player FunZone layout: partner tower BESIDE existing content.
           Never restructure the stats/schedule panels or the timeline. */
        #playerFunZone :is(#ppTab-news,#ppTab-connect,#ppTab-upload) .yp-profile-partner-columns {
          display:grid;grid-template-columns:minmax(0,1fr) clamp(165px,22vw,235px);
          align-items:start;gap:20px;width:100%;height:100%;min-height:0;
          background:inherit;
        }
        #playerFunZone .yp-profile-partner-body {
          min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;
          scrollbar-width:thin;
        }
        #playerFunZone .yp-profile-partner-body .pp-news-feed {padding-left:6px;padding-right:6px;}
        #playerFunZone .yp-profile-ad {
          display:flex;flex-direction:column;align-items:center;justify-content:center;gap:15px;
          width:100%;min-width:0;min-height:0;padding:19px 12px;
          border:1px dashed #9b9b9b;border-radius:4px;
          color:#ececec;background:#191919;text-align:center;
        }
        #playerFunZone .yp-profile-ad span {font:800 10px/1.25 var(--yat-font-compact);letter-spacing:.07em;color:#ccc;}
        #playerFunZone .yp-profile-ad strong {font:800 clamp(17px,2vw,27px)/1.05 var(--yat-font-compact);}
        #playerFunZone .yp-profile-ad small {font:400 11px/1.4 var(--yat-font-ui);color:#bbb;}
        #playerFunZone .yp-profile-partner-connect {display:flex;flex-direction:column;align-items:center;gap:11px;justify-content:flex-start;padding:13px;}
        #playerFunZone .yp-player-video-placeholder {display:flex;flex-direction:column;gap:9px;align-items:center;justify-content:center;min-height:190px;width:100%;padding:14px;border:1px solid #444;background:radial-gradient(circle at 50% 40%,#194b36,#0d1512 70%);color:#eee;text-align:center;}
        #playerFunZone .yp-player-video-placeholder i {font-size:40px;line-height:1;}
        #playerFunZone .yp-player-video-placeholder strong {font:800 21px/1.1 var(--yat-font-compact);}
        #playerFunZone .yp-player-video-placeholder span {color:#bbb;font:700 11px var(--yat-font-compact);}
        #playerFunZone .yp-profile-partner-connect p {font:400 12px/1.45 var(--yat-font-ui);color:inherit;text-align:center;}
        #playerFunZone .yp-player-video-link {border:1px solid currentColor;padding:8px 11px;font:800 11px/1.1 var(--yat-font-compact);text-decoration:none;color:inherit;}
        @media(max-width:740px) {
          #playerFunZone :is(#ppTab-news,#ppTab-connect,#ppTab-upload) .yp-profile-partner-columns {
            display:flex;flex-direction:column;gap:0;height:100%;overflow:auto;
          }
          #playerFunZone .yp-profile-partner-body {
            flex:1 0 auto;min-height:0;max-height:none;overflow:visible;
          }
          #playerFunZone .yp-profile-ad {
            flex:0 0 auto;flex-direction:row;gap:12px;justify-content:space-around;
            min-height:76px;max-height:95px;padding:10px;margin:5px 0 12px;
          }
          #playerFunZone .yp-profile-ad span {font-size:9px;}
          #playerFunZone .yp-profile-ad strong {font-size:16px;}
          #playerFunZone .yp-profile-ad small {max-width:33%;font-size:9px;}
        }

        /* The fixed career header occupies significant vertical space.
           Measure the *remaining* FunZone, not the whole page. The player
           feed is the ONLY scroll surface on desktop; the ad stays still. */
        #playerFunZone { container: yat-profile-ads / inline-size; }
        #playerFunZone :is(#ppTab-news,#ppTab-connect,#ppTab-upload).pp-fz-panel-active {
          overflow:hidden!important;
        }
        #playerFunZone :is(#ppTab-news,#ppTab-connect,#ppTab-upload) .yp-profile-partner-columns {
          display:grid!important;
          grid-template-columns:minmax(0,1fr) 300px!important;
          align-items:stretch!important;
          height:100%!important;
          max-height:100%!important;
          min-height:0!important;
          overflow:hidden!important;
        }
        #playerFunZone :is(#ppTab-news,#ppTab-connect,#ppTab-upload) .yp-profile-partner-body {
          height:100%!important;
          max-height:100%!important;
          min-height:0!important;
          overflow-y:auto!important;
          overflow-x:hidden!important;
          overscroll-behavior-y:contain;
          scrollbar-width:thin;
          -webkit-overflow-scrolling:touch;
        }
        /* A completed 300x600 creative scales UNIFORMLY to fit the panel.
           Never stretch or crop the supplied source file. Its reserved grid
           column is 300px wide, but the displayed artwork can be smaller. */
        #playerFunZone :is(#ppTab-news,#ppTab-connect,#ppTab-upload) .yp-profile-ad {
          box-sizing:border-box;
          width:auto!important;
          min-width:0!important;
          max-width:300px!important;
          aspect-ratio:1/2;
          height:min(600px,calc(
            100dvh - var(--row1-h,36px) - var(--row2-h,54px)
            - var(--row3-h,100px) - var(--row4-h,56px)
            - var(--pp-dock-h,62px) - 34px
          ))!important;
          min-height:0!important;
          max-height:100%!important;
          align-self:start!important;
          justify-self:center!important;
          position:sticky;
          top:0;
          flex:none!important;
          overflow:hidden!important;
        }
        #playerFunZone .yp-profile-ad :is(img,picture,video) {
          display:block;width:100%;height:100%;
          object-fit:contain;object-position:center;
        }
        /* One sponsor card in the feed, same width as a story card. Its
           300x250 source is letterboxed as needed, not cropped to fit. */
        #playerFunZone .yp-profile-infeed-ad {display:none;}
        #playerFunZone :is(.yp-profile-infeed-ad,.yp-stories-feed-ad) {
          box-sizing:border-box!important;
          flex-direction:column;
          align-items:center;justify-content:center;gap:9px;
          width:100%!important;
          max-width:none!important;
          min-height:clamp(140px,23dvh,260px)!important;
          height:auto!important;
          aspect-ratio:auto!important;
          padding:16px;
          margin:12px 0 18px!important;
          border:1px dashed rgba(170,170,170,.65);
          border-radius:6px;
          background:rgba(255,255,255,.045);
          color:inherit;text-align:center;
        }
        #playerFunZone :is(.yp-profile-infeed-ad,.yp-stories-feed-ad) :is(img,picture,video) {
          display:block;max-width:100%;max-height:100%;
          width:auto;height:auto;object-fit:contain;
        }
        #playerFunZone .yp-profile-infeed-ad strong {font:800 18px/1.1 var(--yat-font-compact,Oswald,sans-serif);}
        #playerFunZone .yp-profile-infeed-ad small {font:600 10px/1.2 var(--yat-font-ui,Arial,sans-serif);opacity:.72;}
        #playerFunZone #ppTab-upload .yp-stories-feed-ad {display:none;}
        /* Real container width captures the docked left/right rails as well
           as resize. No forced dock just to make an ad fit. */
        @container yat-profile-ads (max-width:1080px) {
          #playerFunZone :is(#ppTab-news,#ppTab-connect,#ppTab-upload).pp-fz-panel-active {
            overflow-y:auto!important;overflow-x:hidden!important;
          }
          #playerFunZone :is(#ppTab-news,#ppTab-connect,#ppTab-upload) .yp-profile-partner-columns {
            display:block!important;
            width:100%!important;max-width:100%!important;
            height:auto!important;max-height:none!important;
            overflow:visible!important;
            padding-inline:0!important;
          }
          #playerFunZone :is(#ppTab-news,#ppTab-connect,#ppTab-upload) .yp-profile-partner-body {
            height:auto!important;max-height:none!important;
            overflow:visible!important;
          }
          #playerFunZone :is(#ppTab-news,#ppTab-connect,#ppTab-upload) .yp-profile-ad {
            display:none!important;
          }
          #playerFunZone .yp-profile-infeed-ad,
          #playerFunZone #ppTab-upload .yp-stories-feed-ad {display:flex!important;}
        }
        /* Fallback for browsers without container queries; phone layouts
           always use panel scrolling, never a second nested scroll surface. */
        @media (max-width:1080px) {
          #playerFunZone :is(#ppTab-news,#ppTab-connect,#ppTab-upload).pp-fz-panel-active {overflow-y:auto!important;}
          #playerFunZone :is(#ppTab-news,#ppTab-connect,#ppTab-upload) .yp-profile-partner-columns {
            display:block!important;height:auto!important;max-height:none!important;
            overflow:visible!important;padding-inline:0!important;
          }
          #playerFunZone :is(#ppTab-news,#ppTab-connect,#ppTab-upload) .yp-profile-partner-body {
            height:auto!important;max-height:none!important;overflow:visible!important;
          }
          #playerFunZone :is(#ppTab-news,#ppTab-connect,#ppTab-upload) .yp-profile-ad {display:none!important;}
          #playerFunZone .yp-profile-infeed-ad,
          #playerFunZone #ppTab-upload .yp-stories-feed-ad {display:flex!important;}
        }
        /* Avoid the extra scrolling gap between the timeline and Stories tools.
           Keep the scroll clipping inside the active tab, below the timeline. */
        #playerFunZone #ppTab-upload.pp-fz-panel {
          padding-top:0!important;
          scroll-padding-top:0;
        }
        #playerFunZone #ppTab-upload .ysf { padding-top:0!important; }
        /* One desktop tower per feed: Stories owns its own sticky tower;
           News uses the same reserved 300x600 right column. */
        @media (min-width:1081px) {
          #playerFunZone #ppTab-news .yp-profile-partner-columns {
            display:grid!important;grid-template-columns:minmax(0,1fr) 300px!important;
            align-items:start!important;height:auto!important;overflow:visible!important;
          }
          #playerFunZone #ppTab-news .yp-profile-ad {
            display:flex!important;position:sticky!important;top:0!important;
            width:300px!important;height:600px!important;min-height:600px!important;
            max-height:600px!important;aspect-ratio:1/2!important;
          }
          #playerFunZone #ppTab-news .yp-profile-infeed-ad {display:none!important;}
          #playerFunZone #ppTab-upload .yp-profile-partner-columns {
            display:block!important;width:100%!important;max-width:100%!important;
            padding-inline:0!important;overflow:visible!important;
          }
          #playerFunZone #ppTab-upload > .yp-profile-partner-columns > .yp-profile-ad {display:none!important;}
          #playerFunZone #ppTab-upload .yp-profile-partner-body {
            height:auto!important;max-height:none!important;overflow:visible!important;
          }
        }
        /* Container-width rule follows the older 1080px collapse:
           desktop-style News gets a tower whenever the actual panel fits,
           including desktop-site mode and docked browser windows. */
        @container yat-profile-ads (min-width: 841px) {
          #playerFunZone #ppTab-news .yp-profile-partner-columns {
            display:grid!important;grid-template-columns:minmax(0,1fr) 300px!important;
            align-items:start!important;width:100%!important;height:auto!important;
            max-height:none!important;overflow:visible!important;gap:16px!important;
          }
          #playerFunZone #ppTab-news .yp-profile-partner-body {
            height:auto!important;max-height:none!important;
            overflow:visible!important;min-width:0!important;
          }
          #playerFunZone #ppTab-news .yp-profile-ad.yat-desktop-sponsor-tower {
            display:flex!important;position:sticky!important;top:0!important;
            width:300px!important;min-width:300px!important;max-width:300px!important;
            height:600px!important;min-height:600px!important;max-height:600px!important;
            margin:0!important;aspect-ratio:1/2!important;align-self:start!important;
          }
          #playerFunZone #ppTab-news .yp-profile-infeed-ad {display:none!important;}
        }
        /* Connect uses the same desktop tower and single-column video area as News. */
        @container yat-profile-ads (min-width:841px) {
          #playerFunZone #ppTab-connect .yp-profile-partner-columns {
            display:grid!important;grid-template-columns:minmax(0,1fr) 300px!important;
            width:100%!important;max-height:none!important;height:auto!important;
            gap:16px!important;overflow:visible!important;align-items:start!important;
          }
          #playerFunZone #ppTab-connect .yp-profile-partner-body {
            min-width:0!important;height:auto!important;max-height:none!important;
            overflow:visible!important;
          }
          #playerFunZone #ppTab-connect .yp-player-video-placeholder {
            width:100%!important;max-width:100%!important;box-sizing:border-box!important;
          }
          #playerFunZone #ppTab-connect .yp-profile-ad.yat-desktop-sponsor-tower {
            display:flex!important;position:sticky!important;top:0!important;
            width:300px!important;min-width:300px!important;max-width:300px!important;
            height:600px!important;min-height:600px!important;max-height:600px!important;
            margin:0!important;aspect-ratio:1/2!important;align-self:start!important;
          }
          #playerFunZone #ppTab-connect .yp-profile-infeed-ad {display:none!important;}
        }
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
          font: 700 clamp(14px, 2.2vw, 22px)/1 var(--yat-font-ui,Archivo,Arial,sans-serif);
          letter-spacing: .04em;
          color: var(--fg, #f4f4f4);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
        .pp-mc-lbl {
          display: block;
          font: 300 9px/1.1 var(--yat-font-ui,Archivo,Arial,sans-serif);
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
          font: 600 8px/1 var(--yat-font-ui,Archivo,Arial,sans-serif);
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
          border-top-color: var(--fg, #dedede);
        }
        /* Default active tab (Stats) — shown when no hash is targeted */
        .pp-fz-tab-default {
          color: var(--fg, #f0f0f0);
          border-top-color: var(--fg, #dedede);
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
          border-top-color: var(--fg, #dedede);
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
          font: 700 10px var(--yat-font-ui,Archivo,Arial,sans-serif);
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
          font: 600 8px/1 var(--yat-font-ui,Archivo,Arial,sans-serif);
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--muted, #888);
        }
        .pp-stat-val {
          font: 700 15px/1 var(--yat-font-ui,Archivo,Arial,sans-serif);
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
          font: 400 10px/1.4 var(--yat-font-ui,Archivo,Arial,sans-serif);
          min-width: 480px;
        }
        .pp-season-table th {
          font: 600 8px/1 var(--yat-font-ui,Archivo,Arial,sans-serif);
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
          font: 800 20px/1 var(--yat-font-ui,Archivo,Arial,sans-serif);
          letter-spacing: .06em;
          color: var(--fg, #dedede);
          margin-bottom: 4px;
        }
        .pp-social-sub {
          font: 400 11px/1.4 var(--yat-font-ui,Archivo,Arial,sans-serif);
          color: var(--muted, #888);
          margin-bottom: 12px;
        }
        .pp-social-signoff { display:flex; align-items:baseline; flex-wrap:wrap; gap:6px 12px; margin:3px 0 12px; font:400 11px/1.3 var(--yat-font-ui,Archivo,Arial,sans-serif); color:var(--muted,#888); }
        .pp-social-signoff span:first-child { font-weight:800; letter-spacing:.045em; color:var(--fg,#dedede); }
        .pp-social-links {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .pp-social-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font: 400 12px/1 var(--yat-font-ui,Archivo,Arial,sans-serif);
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
          font: 400 11px/1.5 var(--yat-font-ui,Archivo,Arial,sans-serif);
          max-width: 240px;
        }
      `}</style>
    </>
  );
}
