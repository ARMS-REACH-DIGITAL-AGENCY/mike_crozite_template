"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

export type ProfileNewsStory = {
  uuid: string;
  title: string;
  url: string;
  source: string | null;
  publishedAt: string | null;
  recap: string | null;
  whyLocal: string | null;
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

  const topStories = useMemo(() => stories.slice(0, 2), [stories]);
  const otherStories = useMemo(() => stories.slice(2), [stories]);

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
              className="pp-news-headline-card"
              onClick={() => setOpenUuid(story.uuid)}
            >
              <div className="pp-news-meta">
                <span>{(story.source || "News").toUpperCase()}</span>
                {story.publishedAt ? <span>{formatDate(story.publishedAt)}</span> : null}
              </div>
              <div className="pp-news-headline">{stripHtml(story.title) || "Alumni news"}</div>
              {story.recap ? (
                <div className="pp-news-deck">{stripHtml(story.recap)}</div>
              ) : null}
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
                className="pp-news-rail-item"
                onClick={() => setOpenUuid(story.uuid)}
              >
                <span className="pp-news-rail-title">{stripHtml(story.title) || "Alumni news"}</span>
                <span className="pp-news-rail-meta">
                  {(story.source || "News").toUpperCase()}
                  {story.publishedAt ? ` · ${formatDate(story.publishedAt)}` : ""}
                </span>
              </button>
            ))
          ) : (
            <div className="pp-news-rail-empty">More headlines will appear here.</div>
          )}
        </aside>
      </div>

      {openStory ? (
        <div className="pp-news-modal" role="dialog" aria-modal="true" aria-label={stripHtml(openStory.title)}>
          <button
            type="button"
            className="pp-news-modal-backdrop"
            aria-label="Close story"
            onClick={() => setOpenUuid("")}
          />
          <article className="pp-news-modal-sheet">
            <div className="pp-news-modal-header">
              <div>
                <div className="pp-news-modal-kicker">YAT?STATS LOCAL RECAP</div>
                <h3>{stripHtml(openStory.title) || "Alumni news"}</h3>
                <div className="pp-news-modal-meta">
                  {(openStory.source || "News").toUpperCase()}
                  {openStory.publishedAt ? ` · ${formatDate(openStory.publishedAt)}` : ""}
                </div>
              </div>
              <button type="button" className="pp-news-modal-close" onClick={() => setOpenUuid("")} aria-label="Close story">
                ×
              </button>
            </div>

            <div className="pp-news-modal-scroll">
              {openStory.recap ? <p>{stripHtml(openStory.recap)}</p> : null}
              {openStory.whyLocal ? <p className="pp-news-modal-why">{stripHtml(openStory.whyLocal)}</p> : null}
              <a className="pp-news-modal-source" href={openStory.url} target="_blank" rel="noopener noreferrer">
                Read the original story at {(openStory.source || "the source").toUpperCase()}
                <i className="ri-external-link-line" />
              </a>
            </div>
          </article>
        </div>
      ) : null}

      <style>{`
        .pp-news-layout{
          display:grid;
          grid-template-columns:minmax(0,2.2fr) minmax(150px,.8fr);
          gap:12px;
          padding:10px 10px calc(var(--profile-tabs-h,68px) + 12px);
          min-height:100%;
          align-items:start;
        }
        .pp-news-main,.pp-news-rail{display:flex;flex-direction:column;gap:10px;min-width:0}
        .pp-news-headline-card,.pp-news-rail-item{
          appearance:none;
          width:100%;
          text-align:left;
          cursor:pointer;
          color:inherit;
          border:1px solid var(--line,rgba(255,255,255,.14));
          background:rgba(255,255,255,.035);
          border-radius:8px;
        }
        .pp-news-headline-card{padding:13px 14px}
        .pp-news-headline-card:hover,.pp-news-rail-item:hover{border-color:var(--gold,#ffc107)}
        .pp-news-meta{
          display:flex;
          justify-content:space-between;
          gap:10px;
          font:400 10px/1.2 Oswald,sans-serif;
          letter-spacing:.06em;
          color:var(--muted,#999);
          margin-bottom:5px;
        }
        .pp-news-headline{
          font:400 22px/1.05 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.02em;
          color:var(--fg,#fff);
        }
        .pp-news-deck{
          margin-top:7px;
          font:400 12px/1.35 Georgia,"Times New Roman",serif;
          color:var(--muted,#aaa);
          display:-webkit-box;
          -webkit-line-clamp:2;
          -webkit-box-orient:vertical;
          overflow:hidden;
        }
        .pp-news-rail-label{
          font:700 10px/1 Oswald,sans-serif;
          letter-spacing:.1em;
          color:var(--gold,#ffc107);
          padding:2px 2px 0;
        }
        .pp-news-rail-item{
          padding:9px 10px;
          display:flex;
          flex-direction:column;
          gap:5px;
        }
        .pp-news-rail-title{
          font:400 15px/1.08 "Bebas Neue",Oswald,sans-serif;
          color:var(--fg,#fff);
        }
        .pp-news-rail-meta,.pp-news-rail-empty{
          font:400 9px/1.2 Oswald,sans-serif;
          color:var(--muted,#999);
          letter-spacing:.04em;
        }

        .pp-news-modal{
          position:fixed;
          inset:0;
          z-index:10050;
          display:flex;
          align-items:stretch;
          justify-content:center;
          padding:0;
        }
        .pp-news-modal-backdrop{
          position:absolute;
          inset:0;
          border:0;
          background:rgba(0,0,0,.78);
          cursor:pointer;
        }
        .pp-news-modal-sheet{
          position:relative;
          z-index:1;
          width:min(760px,100%);
          height:100dvh;
          background:#111;
          color:#fff;
          display:flex;
          flex-direction:column;
          box-shadow:0 0 40px rgba(0,0,0,.55);
        }
        .pp-news-modal-header{
          display:flex;
          justify-content:space-between;
          gap:14px;
          padding:18px 18px 14px;
          border-bottom:1px solid rgba(255,255,255,.12);
          flex:0 0 auto;
        }
        .pp-news-modal-kicker{
          color:var(--gold,#ffc107);
          font:700 11px/1 Oswald,sans-serif;
          letter-spacing:.1em;
          margin-bottom:7px;
        }
        .pp-news-modal-header h3{
          margin:0;
          font:400 24px/1.08 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.02em;
        }
        .pp-news-modal-meta{
          margin-top:7px;
          font:400 10px/1.2 Oswald,sans-serif;
          letter-spacing:.06em;
          color:rgba(255,255,255,.55);
        }
        .pp-news-modal-close{
          border:0;
          background:transparent;
          color:#fff;
          font:300 34px/1 Arial,sans-serif;
          cursor:pointer;
          padding:0 2px;
          align-self:flex-start;
        }
        .pp-news-modal-scroll{
          overflow-y:auto;
          padding:18px 20px 28px;
          flex:1;
          -webkit-overflow-scrolling:touch;
        }
        .pp-news-modal-scroll p{
          margin:0 0 16px;
          font:400 15px/1.68 Georgia,"Times New Roman",serif;
          color:rgba(255,255,255,.94);
        }
        .pp-news-modal-why{
          padding-top:14px;
          border-top:1px solid rgba(255,255,255,.12);
          font-style:italic !important;
          color:rgba(255,255,255,.72) !important;
        }
        .pp-news-modal-source{
          display:inline-flex;
          align-items:center;
          gap:7px;
          margin-top:8px;
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
          .pp-news-headline-card{padding:10px}
          .pp-news-headline{font-size:18px}
          .pp-news-deck{font-size:11px}
          .pp-news-rail-item{padding:8px}
          .pp-news-rail-title{font-size:13px}
          .pp-news-modal-header{padding:14px 14px 12px}
          .pp-news-modal-header h3{font-size:21px}
          .pp-news-modal-scroll{padding:15px 16px 24px}
          .pp-news-modal-scroll p{font-size:14px;line-height:1.65}
        }
      `}</style>
    </>
  );
}
