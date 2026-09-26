"use client";

// Profile page News tab (#ppTab-news): the player's stories, newest first -
// headline, source/date, recap, and a link to the original story.
//
// The Alumni News page's "Read more on <player>'s profile" button links
// here with ?story=<uuid>#ppTab-news; that story is moved to the top and
// highlighted so the fan lands on what they clicked.

import { useSyncExternalStore } from "react";

export type ProfileNewsStory = {
  uuid: string;
  title: string;
  url: string;
  source: string | null;
  publishedAt: string | null;
  recap: string | null;
  whyLocal: string | null;
};

// ?story=<uuid> from the address bar; "" during server render/hydration.
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
    : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default function ProfileNewsList({
  stories,
  firstName,
}: {
  stories: ProfileNewsStory[];
  firstName: string;
}) {
  const storyParam = useStoryParam();
  const selected = stories.some((s) => s.uuid === storyParam) ? storyParam : "";

  if (stories.length === 0) {
    return (
      <div className="pp-fz-placeholder">
        <i className="ri-newspaper-line pp-ph-icon" />
        <p>Latest headlines for {firstName} will appear here.</p>
      </div>
    );
  }

  const ordered = selected
    ? [...stories.filter((s) => s.uuid === selected), ...stories.filter((s) => s.uuid !== selected)]
    : stories;

  return (
    <div className="pp-news-list">
      {ordered.map((story) => {
        const recap = stripHtml(story.recap);
        const why = stripHtml(story.whyLocal);
        return (
          <article
            key={story.uuid}
            id={`news-story-${story.uuid}`}
            className={`pp-news-item${story.uuid === selected ? " is-selected" : ""}`}
          >
            <div className="pp-news-meta">
              <span>{(story.source || "News").toUpperCase()}</span>
              {story.publishedAt ? <span>{formatDate(story.publishedAt)}</span> : null}
            </div>
            <h3 className="pp-news-title">{stripHtml(story.title) || "Alumni news"}</h3>
            {recap ? <p className="pp-news-recap">{recap}</p> : null}
            {why ? <p className="pp-news-why">{why}</p> : null}
            <a className="pp-news-link" href={story.url} target="_blank" rel="noopener noreferrer">
              Read the full story at {(story.source || "the source").toUpperCase()}{" "}
              <i className="ri-external-link-line" />
            </a>
          </article>
        );
      })}
      <style>{`
        .pp-news-list{display:flex;flex-direction:column;gap:10px;padding:10px 10px calc(var(--profile-tabs-h,68px) + 12px);overflow:auto}
        .pp-news-item{border:1px solid var(--line,rgba(255,255,255,.14));border-radius:8px;padding:12px 14px;background:rgba(255,255,255,.03)}
        .pp-news-item.is-selected{border-color:var(--green,#00e676);box-shadow:0 0 0 1px var(--green,#00e676) inset}
        .pp-news-meta{display:flex;justify-content:space-between;gap:10px;font:400 11px/1.2 Oswald,sans-serif;letter-spacing:.06em;color:var(--muted,#999);margin-bottom:6px}
        .pp-news-title{margin:0 0 8px;font:400 20px/1.1 "Bebas Neue",Oswald,sans-serif;letter-spacing:.02em;color:var(--fg,#fff)}
        .pp-news-recap{margin:0 0 8px;font:400 14px/1.45 Oswald,sans-serif;color:var(--fg,#fff);opacity:.85}
        .pp-news-why{margin:0 0 10px;padding-top:8px;border-top:1px solid var(--line,rgba(255,255,255,.12));font:400 12px/1.4 Oswald,sans-serif;color:var(--muted,#999)}
        .pp-news-link{display:inline-flex;align-items:center;gap:6px;font:400 13px/1 "Bebas Neue",Oswald,sans-serif;letter-spacing:.08em;color:var(--green,#00e676);text-decoration:none}
      `}</style>
    </div>
  );
}
