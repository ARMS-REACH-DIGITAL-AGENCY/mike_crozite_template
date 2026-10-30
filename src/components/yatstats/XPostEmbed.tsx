"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { getXPostId } from "@/lib/newsVideo";

type XWidgetApi = {
  ready?: (callback: (api: XWidgetApi) => void) => void;
  widgets?: {
    createTweet?: (
      postId: string,
      target: HTMLElement,
      options: { theme: "light" | "dark"; conversation: "none"; dnt: true; align: "center" }
    ) => Promise<HTMLElement | null | undefined>;
  };
};

type EmbedState = "loading" | "ready" | "error";

/**
 * X posts cannot be framed as x.com pages. The official widgets.js API
 * renders public posts (and their attached video) into an isolated widget.
 * Load it only when a news reader opens an X story, not on every school page.
 */
export default function XPostEmbed({ url, title }: { url: string; title: string }) {
  const postId = getXPostId(url);
  const targetRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [state, setState] = useState<EmbedState>("loading");

  // Some browsers silently block the third-party script rather than firing onError.
  // Never leave fans staring at an indefinite loading screen.
  useEffect(() => {
    if (!postId || state !== "loading") return;
    const timeout = window.setTimeout(() => setState("error"), 15000);
    return () => window.clearTimeout(timeout);
  }, [postId, state]);

  useEffect(() => {
    if (!scriptReady || !postId) return;
    const target = targetRef.current;
    if (!target) return;

    let active = true;
    setState("loading");
    const fail = () => { if (active) setState("error"); };
    const render = (api: XWidgetApi) => {
      if (!active) return;
      if (!api.widgets?.createTweet) { fail(); return; }
      try {
        Promise.resolve(api.widgets.createTweet(postId, target, {
          theme: document.body.classList.contains("light-theme") ? "light" : "dark",
          conversation: "none",
          dnt: true,
          align: "center",
        })).then((element) => {
          if (active) setState(element ? "ready" : "error");
        }, fail);
      } catch {
        fail();
      }
    };

    const twitter = (window as Window & { twttr?: XWidgetApi }).twttr;
    try {
      if (twitter?.ready) twitter.ready(render);
      else if (twitter) render(twitter);
      else fail();
    } catch {
      fail();
    }

    return () => {
      active = false;
      target.replaceChildren();
    };
  }, [postId, scriptReady]);

  const unavailable = state === "error" || !postId;
  return (
    <div className="pp-news-x-embed" aria-label={`X video: ${title}`}>
      {postId ? (
        <Script
          src="https://platform.x.com/widgets.js"
          strategy="afterInteractive"
          onReady={() => setScriptReady(true)}
          onError={() => setState("error")}
        />
      ) : null}
      <div ref={targetRef} className="pp-news-x-widget" />
      {state === "loading" && postId ? (
        <p className="pp-news-x-status" role="status">Loading video from X…</p>
      ) : null}
      {unavailable ? (
        <div className="pp-news-x-fallback">
          <p>X could not display this post here. It may be unavailable or third-party embeds may be blocked.</p>
          <a href={url} target="_blank" rel="noopener noreferrer">Watch original video on X</a>
        </div>
      ) : null}
      <style>{`
        .pp-news-x-embed{width:100%;max-width:100%;min-height:180px;padding:8px 0 14px;background:#080808;color:white}
        .pp-news-x-widget{width:min(100%,550px);margin:0 auto}
        .pp-news-x-widget iframe{max-width:100%}
        .pp-news-x-status,.pp-news-x-fallback{max-width:550px;margin:0 auto;padding:24px 12px;text-align:center;color:#eee;font:500 14px/1.5 var(--yat-font-ui,Archivo,Arial,sans-serif)}
        .pp-news-x-fallback a{display:inline-block;margin-top:10px;font-weight:800;color:#ffb21c;text-decoration:underline;text-underline-offset:3px}
        .pp-news-x-fallback p{margin:0}
      `}</style>
    </div>
  );
}
