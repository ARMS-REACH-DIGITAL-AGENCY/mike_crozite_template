"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ProfileContentModalProps = {
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
 * Shared full-viewport reader for profile content.
 *
 * News uses it as a clean story reader today.
 * Fan Moments / Stories can reuse the same shell with media, reaction/share/tag
 * actions, comments, and photo galleries without rebuilding modal behavior.
 */
export default function ProfileContentModal({
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
  maxWidth = 760,
}: ProfileContentModalProps) {
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
    <div className="yat-content-modal" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <button
        type="button"
        className="yat-content-modal__backdrop"
        aria-label="Close"
        onClick={onClose}
      />

      <article
        className={`yat-content-modal__sheet ${media ? "yat-content-modal__sheet--media" : ""}`}
        style={{ ["--yat-content-modal-max" as string]: `${maxWidth}px` }}
      >
        <div className="yat-content-modal__header">
          <div className="yat-content-modal__heading">
            {kicker ? <div className="yat-content-modal__kicker">{kicker}</div> : null}
            <h3>{title}</h3>
            {meta ? <div className="yat-content-modal__meta">{meta}</div> : null}
          </div>

          <button
            type="button"
            className="yat-content-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {actions ? <div className="yat-content-modal__actions">{actions}</div> : null}

        <div className="yat-content-modal__content">
          {media ? <div className="yat-content-modal__media">{media}</div> : null}

          <div className="yat-content-modal__scroll">
            {children}
            {footer ? <div className="yat-content-modal__footer">{footer}</div> : null}
          </div>
        </div>
      </article>

      <style jsx global>{`
        .yat-content-modal{
          position:fixed;
          inset:0;
          z-index:2147483000;
          display:flex;
          align-items:stretch;
          justify-content:center;
          padding:0;
        }
        .yat-content-modal__backdrop{
          position:absolute;
          inset:0;
          border:0;
          background:rgba(0,0,0,.82);
          cursor:pointer;
        }
        .yat-content-modal__sheet{
          position:relative;
          z-index:1;
          width:min(var(--yat-content-modal-max,760px),100vw);
          height:100dvh;
          min-height:100dvh;
          background:#111;
          color:#fff;
          display:flex;
          flex-direction:column;
          box-shadow:0 0 40px rgba(0,0,0,.55);
          overflow:hidden;
        }
        .yat-content-modal__header{
          display:flex;
          justify-content:space-between;
          gap:14px;
          padding:18px 18px 14px;
          border-bottom:1px solid rgba(255,255,255,.12);
          flex:0 0 auto;
        }
        .yat-content-modal__heading{min-width:0}
        .yat-content-modal__kicker{
          color:var(--gold,#ffc107);
          font:700 11px/1 Oswald,sans-serif;
          letter-spacing:.1em;
          margin-bottom:7px;
          text-transform:uppercase;
        }
        .yat-content-modal__header h3{
          margin:0;
          font:400 24px/1.08 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.02em;
        }
        .yat-content-modal__meta{
          margin-top:7px;
          font:400 10px/1.2 Oswald,sans-serif;
          letter-spacing:.06em;
          color:rgba(255,255,255,.55);
        }
        .yat-content-modal__close{
          border:0;
          background:transparent;
          color:#fff;
          font:300 34px/1 Arial,sans-serif;
          cursor:pointer;
          padding:0 2px;
          align-self:flex-start;
          flex:0 0 auto;
        }
        .yat-content-modal__actions{
          flex:0 0 auto;
          border-bottom:1px solid rgba(255,255,255,.10);
          padding:8px 14px;
        }
        .yat-content-modal__content{
          min-height:0;
          flex:1;
          display:flex;
          flex-direction:column;
        }
        .yat-content-modal__sheet--media .yat-content-modal__content{
          display:grid;
          grid-template-columns:minmax(240px,42%) minmax(0,1fr);
        }
        .yat-content-modal__media{
          min-height:0;
          background:#080808;
          overflow:auto;
        }
        .yat-content-modal__scroll{
          min-height:0;
          overflow-y:auto;
          padding:18px 20px 28px;
          flex:1;
          -webkit-overflow-scrolling:touch;
        }
        .yat-content-modal__footer{margin-top:18px}
        @media(max-width:700px){
          .yat-content-modal__header{padding:14px 14px 12px}
          .yat-content-modal__header h3{font-size:21px}
          .yat-content-modal__scroll{padding:15px 16px 24px}
          .yat-content-modal__sheet--media .yat-content-modal__content{
            display:flex;
            flex-direction:column;
          }
          .yat-content-modal__sheet--media .yat-content-modal__media{
            flex:0 0 min(38dvh,320px);
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
