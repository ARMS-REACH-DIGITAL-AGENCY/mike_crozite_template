"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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

  const topStories = useMemo(
    () => stories.filter((story) => story.newsworthiness !== "LOW").slice(0, 2),
    [stories]
  );
  const topIds = useMemo(() => new Set(topStories.map((story) => story.uuid)), [topStories]);
  const otherStories = useMemo(
    () => stories.filter((story) => !topIds.has(story.uuid)),
    [stories, topIds]
  );

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
      <div className="pp-news-layout">
        <section className="pp-news-main" aria-label={`${firstName}'s top news stories`}>
          {topStories.map((story) => (
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
                <div className="pp-news-label">YAT?STATS NEWS</div>
                <div className="pp-news-title">{stripHtml(story.title) || "Alumni news"}</div>
                {story.tease ? <div className="pp-news-body">{stripHtml(story.tease)}</div> : null}
                <div className="pp-news-footer">
                  {(story.source || "News").toUpperCase()}
                  {story.publishedAt ? ` · ${formatDate(story.publishedAt)}` : ""}
                </div>
              </div>
            </button>
          ))}
        </section>

        <aside className="pp-news-rail" aria-label="Other news">
          <div className="pp-news-rail-label">OTHER NEWS</div>
          {otherStories.length ? (
            otherStories.map((story) => (
              <button
                type="button"
                key={story.uuid}
                className="pp-news-teaser pp-news-teaser-rail"
                onClick={() => setOpenUuid(story.uuid)}
              >
                {story.imageUrl ? (
                  <img className="pp-news-thumb pp-news-thumb-rail" src={story.imageUrl} alt="" />
                ) : (
                  <div className="pp-news-thumb pp-news-thumb-rail pp-news-thumb-fallback">NEWS</div>
                )}
                <div className="pp-news-copy">
                  <div className="pp-news-label">
                    {story.newsworthiness === "LOW" ? "NEWS NUGGET" : "YAT?STATS NEWS"}
                  </div>
                  <div className="pp-news-title pp-news-title-rail">
                    {stripHtml(story.title) || "Alumni news"}
                  </div>
                  <div className="pp-news-footer">
                    {(story.source || "News").toUpperCase()}
                    {story.publishedAt ? ` · ${formatDate(story.publishedAt)}` : ""}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="pp-news-rail-empty">More headlines will appear here.</div>
          )}
        </aside>
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
        .pp-news-layout{
          display:grid;
          grid-template-columns:minmax(0,2.2fr) minmax(150px,.8fr);
          gap:12px;
          padding:10px 10px calc(var(--profile-tabs-h,68px) + 12px);
          min-height:100%;
          align-items:start;
        }
        .pp-news-main,.pp-news-rail{
          display:flex;
          flex-direction:column;
          gap:10px;
          min-width:0;
        }
        .pp-news-rail-label{
          font:700 10px/1 Oswald,sans-serif;
          letter-spacing:.1em;
          color:var(--gold,#ffc107);
          padding:2px 2px 0;
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
          border:1px solid rgba(30,22,14,.18);
          border-radius:8px;
          background:rgba(255,255,255,.18);
          box-shadow:inset 0 1px 0 rgba(255,255,255,.22);
          color:inherit;
        }
        .pp-news-teaser:hover{
          border-color:var(--gold,#ffc107);
        }
        .pp-news-thumb{
          display:block;
          flex:0 0 auto;
          width:68px;
          height:88px;
          object-fit:cover;
          border-radius:8px;
          border:1px solid rgba(30,22,14,.18);
          box-shadow:0 1px 3px rgba(0,0,0,.12);
          background:rgba(30,22,14,.06);
        }
        .pp-news-thumb-fallback{
          display:flex;
          align-items:center;
          justify-content:center;
          font:700 11px "Bebas Neue",sans-serif;
          letter-spacing:.08em;
          color:rgba(30,22,14,.55);
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
          color:rgba(30,22,14,.5);
        }
        .pp-news-title{
          font:700 17px/1.12 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.03em;
          color:rgba(30,22,14,.9);
        }
        .pp-news-body{
          font:400 12px/1.35 Georgia,"Times New Roman",serif;
          color:rgba(30,22,14,.82);
          display:-webkit-box;
          -webkit-line-clamp:2;
          -webkit-box-orient:vertical;
          overflow:hidden;
        }
        .pp-news-footer{
          font:700 9px/1.2 Oswald,sans-serif;
          letter-spacing:.06em;
          text-transform:uppercase;
          color:rgba(30,22,14,.5);
        }
        .pp-news-teaser-rail{
          gap:7px;
          padding:6px;
        }
        .pp-news-thumb-rail{
          width:48px;
          height:62px;
          border-radius:6px;
        }
        .pp-news-title-rail{
          font-size:13px;
          line-height:1.08;
        }
        .pp-news-rail-empty{
          font:400 9px/1.2 Oswald,sans-serif;
          color:var(--muted,#999);
          letter-spacing:.04em;
        }

        .pp-news-reader-copy{
          margin:0 0 16px;
          font:400 15px/1.68 Georgia,"Times New Roman",serif;
          color:rgba(255,255,255,.94);
        }
        .pp-news-modal-why{
          padding-top:14px;
          border-top:1px solid rgba(255,255,255,.12);
          font-style:italic;
          color:rgba(255,255,255,.72);
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
          .pp-news-layout{
            grid-template-columns:minmax(0,1fr) minmax(118px,.42fr);
            gap:8px;
            padding-left:8px;
            padding-right:8px;
          }
          .pp-news-teaser{gap:7px;padding:6px}
          .pp-news-thumb{width:58px;height:76px}
          .pp-news-title{font-size:14px}
          .pp-news-body{font-size:10px}
          .pp-news-thumb-rail{width:42px;height:54px}
          .pp-news-title-rail{font-size:12px}
          .pp-news-reader-copy{font-size:14px;line-height:1.65}
        }
      `}</style>
    </>
  );
}
