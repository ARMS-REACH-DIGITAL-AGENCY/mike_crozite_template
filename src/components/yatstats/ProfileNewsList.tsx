"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import SortToggle, { type SortDir } from "./SortToggle";
import CardPhoto from "./CardPhoto";
import { markPlayerName } from "./PlayerNameMentions";
import ProfileContentDrawer from "./ProfileContentDrawer";
import { getNewsPhotoSrcs, PLAYER_SILHOUETTE_URL } from "@/lib/playerImage";
import { track } from "@/lib/analytics";

export type ProfileNewsStory = {
  uuid: string;
  title: string;
  url: string;
  source: string | null;
  publishedAt: string | null;
  recap: string | null;
  whyLocal: string | null;
  imageUrl: string | null;
  newsworthiness: string;
  tease: string | null;
};

const noSubscribe = () => () => {};
function useStoryParam(): string {
  return useSyncExternalStore(
    noSubscribe,
    () => new URLSearchParams(window.location.search).get("story") || "",
    () => ""
  );
}

function stripHtml(text: string | null | undefined): string {
  return (text || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default function ProfileNewsList({
  stories,
  firstName,
  playerId,
  playerName,
}: {
  stories: ProfileNewsStory[];
  firstName: string;
  playerId: string;
  // Bolded in each story's copy; not linked - this is his profile already.
  playerName: string;
}) {
  const storyParam = useStoryParam();
  const [openUuid, setOpenUuid] = useState<string>("");

  useEffect(() => {
    if (storyParam && stories.some((s) => s.uuid === storyParam)) {
      setOpenUuid(storyParam);
    }
  }, [storyParam, stories]);

  const openStory = stories.find((s) => s.uuid === openUuid) || null;

  // Newest first by default; ▲▼ at the top flips it (same as Stories).
  const [sort, setSort] = useState<SortDir>("newest");
  const sorted = useMemo(() => {
    const time = (s: ProfileNewsStory) => (s.publishedAt ? new Date(s.publishedAt).getTime() || 0 : 0);
    return stories.slice().sort((a, b) => (sort === "newest" ? time(b) - time(a) : time(a) - time(b)));
  }, [stories, sort]);


  if (stories.length === 0) {
    return (
      <div className="pp-fz-placeholder">
        <i className="ri-newspaper-line pp-ph-icon" />
        <p>Latest headlines for {firstName} will appear here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="pp-news-feed" aria-label={`${firstName}'s news stories`}>
        <div className="pp-news-tools">
          <SortToggle dir={sort} onChange={setSort} />
        </div>
        {sorted.map((story) => (
          <button
            type="button"
            key={story.uuid}
            className="pp-news-teaser"
            onClick={() => { setOpenUuid(story.uuid); track("news_open", { uuid: story.uuid }); }}
          >
            <div className="pp-news-label">
              {story.newsworthiness === "LOW" ? "NEWS NUGGET" : "YAT?STATS NEWS"}
            </div>
            <div className="pp-news-row">
              {/* Our own photo of the player, silhouette behind it. */}
              <div
                className="pp-news-thumb pp-news-thumb-photo"
                style={{ backgroundImage: `url('${PLAYER_SILHOUETTE_URL}')` }}
              >
                <CardPhoto srcs={getNewsPhotoSrcs(playerId, story.imageUrl)} className="pp-news-thumb-img" />
              </div>
              <div className="pp-news-copy">
                <div className="pp-news-title">{stripHtml(story.title) || "Alumni news"}</div>
                {story.tease ? <div className="pp-news-body">{markPlayerName(stripHtml(story.tease), playerName)}</div> : null}
                <div className="pp-news-footer">
                  {(story.source || "News").toUpperCase()}
                  {story.publishedAt ? ` · ${formatDate(story.publishedAt)}` : ""}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <ProfileContentDrawer
        open={Boolean(openStory)}
        onClose={() => setOpenUuid("")}
        ariaLabel={stripHtml(openStory?.title) || "Alumni news"}
        kicker="YAT?STATS LOCAL RECAP"
        title={stripHtml(openStory?.title) || "Alumni news"}
        meta={
          openStory
            ? `${(openStory.source || "News").toUpperCase()}${openStory.publishedAt ? ` · ${formatDate(openStory.publishedAt)}` : ""}`
            : undefined
        }
        footer={
          openStory ? (
            <a className="pp-news-modal-source" href={openStory.url} target="_blank" rel="noopener noreferrer">
              Read the original story at {(openStory.source || "the source").toUpperCase()}
              <i className="ri-external-link-line" />
            </a>
          ) : null
        }
      >
        {openStory?.recap ? <p className="pp-news-reader-copy">{markPlayerName(stripHtml(openStory.recap), playerName)}</p> : null}
      </ProfileContentDrawer>

      <style>{`
        .pp-news-feed{
          --pp-news-card-bg:rgba(255,255,255,.055);
          --pp-news-card-border:rgba(255,255,255,.14);
          --pp-news-card-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 1px 3px rgba(0,0,0,.22);
          --pp-news-thumb-bg:rgba(255,255,255,.06);
          --pp-news-thumb-border:rgba(255,255,255,.13);
          --pp-news-title:rgba(255,255,255,.95);
          --pp-news-body:rgba(255,255,255,.78);
          --pp-news-muted:rgba(255,255,255,.52);
          --pp-news-label:var(--gold,#ffc107);
          display:flex;
          flex-direction:column;
          gap:0;
          padding:8px 12px calc(var(--profile-tabs-h,68px) + 16px);
          min-height:100%;
          min-width:0;
        }
        body.light-theme .pp-news-feed{
          --pp-news-card-bg:rgba(255,255,255,.52);
          --pp-news-card-border:rgba(53,43,30,.18);
          --pp-news-card-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 1px 3px rgba(72,54,30,.08);
          --pp-news-thumb-bg:rgba(53,43,30,.05);
          --pp-news-thumb-border:rgba(53,43,30,.17);
          --pp-news-title:rgba(31,25,18,.94);
          --pp-news-body:rgba(31,25,18,.78);
          --pp-news-muted:rgba(31,25,18,.52);
          --pp-news-label:#b78600;
        }
        /* The eyebrow on its own line at the top left; under it the photo
           and the headline side by side, their tops level. */
        /* The ▲▼ sort stays pinned at the top of the tab while scrolling. */
        .pp-news-tools{
          position:sticky;
          top:0;
          z-index:6;
          display:flex;
          justify-content:flex-end;
          margin:-10px 0 0;
          padding:8px 0 6px;
          background:var(--psi-page-bg,#070707);
        }
        .pp-news-teaser{
          appearance:none;
          width:100%;
          display:flex;
          flex-direction:column;
          align-items:stretch;
          gap:8px;
          min-width:0;
          padding:14px 0;
          text-align:left;
          cursor:pointer;
          border:0;
          border-bottom:1px solid var(--pp-news-card-border);
          border-radius:0;
          background:transparent;
          box-shadow:none;
          color:var(--pp-news-title);
          transition:border-color .15s ease,background .15s ease,transform .15s ease;
        }
        .pp-news-teaser:hover{
          border-color:var(--gold,#ffc107);
        }
        .pp-news-teaser:active{
          transform:scale(.997);
        }
        .pp-news-row{
          display:flex;
          align-items:flex-start;
          gap:10px;
          min-width:0;
        }
        .pp-news-thumb{
          display:block;
          flex:0 0 auto;
          width:112px;
          height:76px;
          object-fit:cover;
          border-radius:6px;
          border:1px solid var(--pp-news-thumb-border);
          box-shadow:0 1px 3px rgba(0,0,0,.16);
          background:var(--pp-news-thumb-bg);
        }
        .pp-news-thumb-fallback{
          display:flex;
          align-items:center;
          justify-content:center;
          font:700 11px var(--yat-font-ui,"Archivo",Arial,sans-serif);
          letter-spacing:.01em;
          color:var(--pp-news-muted);
        }
        .pp-news-copy{
          display:flex;
          flex:1;
          min-width:0;
          flex-direction:column;
          gap:4px;
        }
        .pp-news-label{
          font:700 9px/1 var(--yat-font-ui,"Archivo",Arial,sans-serif);
          letter-spacing:.05em;
          text-transform:uppercase;
          color:var(--pp-news-label);
        }
        .pp-news-title{
          margin-top:-.08em;
          font:800 17px/1.2 var(--yat-font-ui,"Archivo",Arial,sans-serif);
          letter-spacing:-.02em;
          color:var(--pp-news-title);
        }
        .pp-news-body{
          font:400 13px/1.45 var(--yat-font-ui,"Archivo",Arial,sans-serif);
          color:var(--pp-news-body);
          display:-webkit-box;
          -webkit-line-clamp:2;
          -webkit-box-orient:vertical;
          overflow:hidden;
        }
        .pp-news-footer{
          font:600 10px/1.25 var(--yat-font-ui,"Archivo",Arial,sans-serif);
          letter-spacing:0;
          text-transform:uppercase;
          color:var(--pp-news-muted);
        }

        .pp-news-reader-copy{
          margin:0 0 16px;
          font:400 18px/1.62 var(--yat-news-font,Georgia,serif);
          color:var(--yat-content-drawer-copy,rgba(255,255,255,.94));
        }
        .pp-news-modal-why{
          padding-top:14px;
          border-top:1px solid var(--yat-content-drawer-border,rgba(255,255,255,.12));
          font-style:italic;
          color:var(--yat-content-drawer-muted,rgba(255,255,255,.72));
        }
        .pp-news-modal-source{
          display:inline-flex;
          align-items:center;
          gap:7px;
          color:var(--gold,#ffc107);
          text-decoration:none;
          font:600 12px/1.25 var(--yat-font-ui,"Archivo",Arial,sans-serif);
          letter-spacing:0;
          text-transform:uppercase;
        }

        @media(max-width:640px){
          .pp-news-feed{
            gap:8px;
            padding-left:8px;
            padding-right:8px;
          }
          .pp-news-teaser{gap:7px;padding:12px 0}
          .pp-news-row{gap:8px}
          .pp-news-thumb{width:96px;height:68px}
          .pp-news-title{font-size:16px}
          .pp-news-body{font-size:12px}
          .pp-news-reader-copy{font-size:14px;line-height:1.65}
        }

        /* Story copy in the shared news font (globals.css), and never
           smaller than 12px on a phone. */
        .pp-news-body,
        .pp-news-reader-copy{font-family:var(--yat-news-font)}
        .pp-news-body{font-size:13px;line-height:1.4}
        .pp-news-thumb-photo{position:relative;overflow:hidden;background-position:center;background-size:cover}
        .pp-news-thumb-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
        body.light-theme .pp-news-modal-source{color:#9a6f00}
        @media(max-width:640px){
          .pp-news-body{font-size:12px}
        }
      `}</style>
    </>
  );
}
