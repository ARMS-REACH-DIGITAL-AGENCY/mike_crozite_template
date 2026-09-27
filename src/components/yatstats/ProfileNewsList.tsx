"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import ProfileContentDrawer from "./ProfileContentDrawer";

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
}: {
  stories: ProfileNewsStory[];
  firstName: string;
}) {
  const storyParam = useStoryParam();
  const [openUuid, setOpenUuid] = useState<string>("");

  useEffect(() => {
    if (storyParam && stories.some((s) => s.uuid === storyParam)) {
      setOpenUuid(storyParam);
    }
  }, [storyParam, stories]);

  const openStory = stories.find((s) => s.uuid === openUuid) || null;


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
        {stories.map((story) => (
          <button
            type="button"
            key={story.uuid}
            className="pp-news-teaser"
            onClick={() => setOpenUuid(story.uuid)}
          >
            {story.imageUrl ? (
              <img className="pp-news-thumb" src={story.imageUrl} alt="" />
            ) : (
              <div className="pp-news-thumb pp-news-thumb-fallback">NEWS</div>
            )}
            <div className="pp-news-copy">
              <div className="pp-news-label">
                {story.newsworthiness === "LOW" ? "NEWS NUGGET" : "YAT?STATS NEWS"}
              </div>
              <div className="pp-news-title">{stripHtml(story.title) || "Alumni news"}</div>
              {story.tease ? <div className="pp-news-body">{stripHtml(story.tease)}</div> : null}
              <div className="pp-news-footer">
                {(story.source || "News").toUpperCase()}
                {story.publishedAt ? ` · ${formatDate(story.publishedAt)}` : ""}
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
        {openStory?.recap ? <p className="pp-news-reader-copy">{stripHtml(openStory.recap)}</p> : null}
        {openStory?.whyLocal ? <p className="pp-news-reader-copy pp-news-modal-why">{stripHtml(openStory.whyLocal)}</p> : null}
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
          gap:10px;
          padding:10px 10px calc(var(--profile-tabs-h,68px) + 12px);
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
        .pp-news-teaser{
          appearance:none;
          width:100%;
          display:flex;
          align-items:flex-start;
          gap:10px;
          min-width:0;
          padding:8px;
          text-align:left;
          cursor:pointer;
          border:1px solid var(--pp-news-card-border);
          border-radius:8px;
          background:var(--pp-news-card-bg);
          box-shadow:var(--pp-news-card-shadow);
          color:var(--pp-news-title);
          transition:border-color .15s ease,background .15s ease,transform .15s ease;
        }
        .pp-news-teaser:hover{
          border-color:var(--gold,#ffc107);
        }
        .pp-news-teaser:active{
          transform:scale(.997);
        }
        .pp-news-thumb{
          display:block;
          flex:0 0 auto;
          width:68px;
          height:88px;
          object-fit:cover;
          border-radius:8px;
          border:1px solid var(--pp-news-thumb-border);
          box-shadow:0 1px 3px rgba(0,0,0,.16);
          background:var(--pp-news-thumb-bg);
        }
        .pp-news-thumb-fallback{
          display:flex;
          align-items:center;
          justify-content:center;
          font:700 11px "Bebas Neue",sans-serif;
          letter-spacing:.08em;
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
          font:700 8px/1 Oswald,sans-serif;
          letter-spacing:.1em;
          text-transform:uppercase;
          color:var(--pp-news-label);
        }
        .pp-news-title{
          font:700 17px/1.12 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.03em;
          color:var(--pp-news-title);
        }
        .pp-news-body{
          font:400 12px/1.35 Georgia,"Times New Roman",serif;
          color:var(--pp-news-body);
          display:-webkit-box;
          -webkit-line-clamp:2;
          -webkit-box-orient:vertical;
          overflow:hidden;
        }
        .pp-news-footer{
          font:700 9px/1.2 Oswald,sans-serif;
          letter-spacing:.06em;
          text-transform:uppercase;
          color:var(--pp-news-muted);
        }

        .pp-news-reader-copy{
          margin:0 0 16px;
          font:400 15px/1.68 Georgia,"Times New Roman",serif;
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
          font:400 12px/1.2 Oswald,sans-serif;
          letter-spacing:.05em;
          text-transform:uppercase;
        }

        @media(max-width:640px){
          .pp-news-feed{
            gap:8px;
            padding-left:8px;
            padding-right:8px;
          }
          .pp-news-teaser{gap:8px;padding:7px}
          .pp-news-thumb{width:62px;height:80px}
          .pp-news-title{font-size:15px}
          .pp-news-body{font-size:10px}
          .pp-news-reader-copy{font-size:14px;line-height:1.65}
        }
      `}</style>
    </>
  );
}
