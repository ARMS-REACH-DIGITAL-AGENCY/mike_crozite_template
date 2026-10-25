"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ProfileContentDrawerProps = {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  kicker?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  media?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
};

/**
 * Shared right-side profile content reader.
 *
 * News uses it for long-form story reading now.
 * Fan Moments / Stories can reuse the same shell with photo galleries,
 * YAT-A-BOY reactions, comments, sharing, and tagged-player actions.
 */
export default function ProfileContentDrawer({
  open,
  onClose,
  ariaLabel,
  kicker,
  title,
  meta,
  media,
  actions,
  children,
  footer,
  maxWidth = 580,
}: ProfileContentDrawerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="yat-content-drawer" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <button
        type="button"
        className="yat-content-drawer__backdrop"
        aria-label="Close story"
        onClick={onClose}
      />

      <article
        className={`yat-content-drawer__sheet ${media ? "yat-content-drawer__sheet--media" : ""}`}
        style={{ ["--yat-content-drawer-max" as string]: `${maxWidth}px` }}
      >
        <div className="yat-content-drawer__header">
          <div className="yat-content-drawer__heading">
            {kicker ? <div className="yat-content-drawer__kicker">{kicker}</div> : null}
            <h3>{title}</h3>
            {meta ? <div className="yat-content-drawer__meta">{meta}</div> : null}
          </div>

          <button
            type="button"
            className="yat-content-drawer__close"
            onClick={onClose}
            aria-label="Close story"
          >
            ×
          </button>
        </div>

        {actions ? <div className="yat-content-drawer__actions">{actions}</div> : null}

        <div className="yat-content-drawer__content">
          {media ? <div className="yat-content-drawer__media">{media}</div> : null}

          <div className="yat-content-drawer__scroll">
            {children}
            {footer ? <div className="yat-content-drawer__footer">{footer}</div> : null}
          </div>
        </div>
      </article>

      <style jsx global>{`
        .yat-content-drawer{
          position:fixed;
          inset:0;
          z-index:2147483000;
          overflow:hidden;
        }
        .yat-content-drawer__backdrop{
          position:absolute;
          inset:0;
          border:0;
          background:rgba(0,0,0,.64);
          cursor:pointer;
        }
        .yat-content-drawer__sheet{
          --yat-content-drawer-bg:#111;
          --yat-content-drawer-header-start:#171717;
          --yat-content-drawer-header-end:#111;
          --yat-content-drawer-fg:#fff;
          --yat-content-drawer-copy:rgba(255,255,255,.94);
          --yat-content-drawer-muted:rgba(255,255,255,.58);
          --yat-content-drawer-border:rgba(255,255,255,.12);
          --yat-content-drawer-close-bg:rgba(255,255,255,.04);
          --yat-content-drawer-media-bg:#080808;
          position:absolute;
          z-index:1;
          top:0;
          right:0;
          width:min(var(--yat-content-drawer-max,580px),92vw);
          height:100dvh;
          min-height:100dvh;
          background:var(--yat-content-drawer-bg);
          color:var(--yat-content-drawer-fg);
          display:flex;
          flex-direction:column;
          box-shadow:-18px 0 48px rgba(0,0,0,.48);
          border-left:0;
          overflow:hidden;
          animation:yatDrawerIn .18s ease-out both;
        }
        body.light-theme .yat-content-drawer__sheet{
          --yat-content-drawer-bg:#f5f5f5;
          --yat-content-drawer-header-start:#fff;
          --yat-content-drawer-header-end:#f5f5f5;
          --yat-content-drawer-fg:#171717;
          --yat-content-drawer-copy:#303030;
          --yat-content-drawer-muted:#666;
          --yat-content-drawer-border:rgba(0,0,0,.10);
          --yat-content-drawer-close-bg:rgba(0,0,0,.055);
          --yat-content-drawer-media-bg:#ededed;
          box-shadow:-12px 0 32px rgba(0,0,0,.16);
          border-left-color:transparent;
        }
        @keyframes yatDrawerIn{
          from{transform:translateX(24px);opacity:.5}
          to{transform:translateX(0);opacity:1}
        }
        .yat-content-drawer__header{
          display:flex;
          justify-content:space-between;
          gap:14px;
          padding:18px 18px 14px;
          border-bottom:1px solid var(--yat-content-drawer-border);
          flex:0 0 auto;
          background:var(--yat-content-drawer-bg);
        }
        .yat-content-drawer__heading{min-width:0}
        .yat-content-drawer__kicker{
          color:var(--yat-content-drawer-muted);
          font:700 11px/1.2 var(--yat-font-ui,Archivo,Arial,sans-serif);
          letter-spacing:.015em;
          margin-bottom:7px;
          text-transform:uppercase;
        }
        .yat-content-drawer__header h3{
          margin:0;
          font:800 20px/1.17 var(--yat-font-ui,Archivo,Arial,sans-serif);
          letter-spacing:-.025em;
        }
        .yat-content-drawer__meta{
          margin-top:8px;
          font:500 11px/1.35 var(--yat-font-ui,Archivo,Arial,sans-serif);
          letter-spacing:0;
          color:var(--yat-content-drawer-muted);
        }
        .yat-content-drawer__close{
          width:38px;
          height:38px;
          border:0;
          border-radius:6px;
          background:var(--yat-content-drawer-close-bg);
          color:var(--yat-content-drawer-fg);
          font:300 28px/1 Arial,sans-serif;
          cursor:pointer;
          padding:0 0 2px;
          align-self:flex-start;
          flex:0 0 auto;
        }
        .yat-content-drawer__actions{
          flex:0 0 auto;
          border-bottom:1px solid var(--yat-content-drawer-border);
          padding:8px 14px;
        }
        .yat-content-drawer__content{
          min-height:0;
          flex:1;
          display:flex;
          flex-direction:column;
        }
        .yat-content-drawer__sheet--media .yat-content-drawer__content{
          display:grid;
          grid-template-rows:auto minmax(0,1fr);
        }
        .yat-content-drawer__media{
          max-height:42dvh;
          background:var(--yat-content-drawer-media-bg);
          overflow:auto;
          border-bottom:1px solid var(--yat-content-drawer-border);
        }
        .yat-content-drawer__scroll{
          min-height:0;
          overflow-y:auto;
          padding:20px 22px 34px;
          flex:1;
          -webkit-overflow-scrolling:touch;
          overscroll-behavior:contain;
        }
        .yat-content-drawer__footer{margin-top:20px}
        @media(max-width:640px){
          .yat-content-drawer__sheet{
            width:94vw;
          }
          .yat-content-drawer__header{
            padding:14px 14px 12px;
          }
          .yat-content-drawer__header h3{
            font-size:21px;
          }
          .yat-content-drawer__scroll{
            padding:16px 16px 28px;
          }
        }

        /* YAT?STATS crest screened back behind the header, the same way
           the Career Path Timeline shows it (.zt-logo-layer): the same
           image, large at 15% opacity, bleeding off the right edge so only
           part of it shows. Same file, so it's already cached on profile
           pages. */
        .yat-content-drawer__header{position:relative;isolation:isolate;overflow:hidden}
        .yat-content-drawer__header::before{
          content:"";
          position:absolute;
          z-index:-1;
          top:50%;
          right:-14%;
          width:62%;
          aspect-ratio:1637/1281;
          transform:translateY(-50%);
          background:url("/img/ys-crest.png") center/contain no-repeat;
          opacity:.15;
          pointer-events:none;
        }
        /* On light neutral backgrounds, display the existing crest as a
           subtle grayscale watermark rather than introducing cream/gold. */
        body.light-theme .yat-content-drawer__header::before{filter:invert(1) grayscale(1);opacity:.065}
      `}</style>
    </div>,
    document.body
  );
}
