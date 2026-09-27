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
          position:absolute;
          z-index:1;
          top:0;
          right:0;
          width:min(var(--yat-content-drawer-max,580px),92vw);
          height:100dvh;
          min-height:100dvh;
          background:#111;
          color:#fff;
          display:flex;
          flex-direction:column;
          box-shadow:-18px 0 48px rgba(0,0,0,.48);
          border-left:1px solid rgba(255,193,7,.28);
          overflow:hidden;
          animation:yatDrawerIn .18s ease-out both;
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
          border-bottom:1px solid rgba(255,255,255,.12);
          flex:0 0 auto;
          background:linear-gradient(180deg,#171717,#111);
        }
        .yat-content-drawer__heading{min-width:0}
        .yat-content-drawer__kicker{
          color:var(--gold,#ffc107);
          font:700 11px/1 Oswald,sans-serif;
          letter-spacing:.1em;
          margin-bottom:7px;
          text-transform:uppercase;
        }
        .yat-content-drawer__header h3{
          margin:0;
          font:400 24px/1.08 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.02em;
        }
        .yat-content-drawer__meta{
          margin-top:7px;
          font:400 10px/1.2 Oswald,sans-serif;
          letter-spacing:.06em;
          color:rgba(255,255,255,.55);
        }
        .yat-content-drawer__close{
          width:38px;
          height:38px;
          border:1px solid rgba(255,255,255,.14);
          border-radius:50%;
          background:rgba(255,255,255,.04);
          color:#fff;
          font:300 28px/1 Arial,sans-serif;
          cursor:pointer;
          padding:0 0 2px;
          align-self:flex-start;
          flex:0 0 auto;
        }
        .yat-content-drawer__actions{
          flex:0 0 auto;
          border-bottom:1px solid rgba(255,255,255,.10);
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
          background:#080808;
          overflow:auto;
          border-bottom:1px solid rgba(255,255,255,.1);
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
      `}</style>
    </div>,
    document.body
  );
}
