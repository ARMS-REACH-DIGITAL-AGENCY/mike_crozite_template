'use client';

import { useEffect, useState } from 'react';

type Message = {
  id: string;
  message_text: string;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  duration_seconds: number;
};

export default function PageMessageStrip({
  hsid, pageKey, activeAlumni,
}: { hsid: string; pageKey: string; activeAlumni: number | null }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [index, setIndex] = useState(0);
  const [teamAlumniCount, setTeamAlumniCount] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setMessages([]);
    setIndex(0);
    fetch(`/api/site-messages?page=${encodeURIComponent(pageKey)}&school=${encodeURIComponent(hsid)}`, {
      signal: controller.signal,
    }).then(response => response.ok ? response.json() : { messages: [] })
      .then(data => { if (!controller.signal.aborted) setMessages(Array.isArray(data.messages) ? data.messages : []); })
      .catch(() => {});
    return () => controller.abort();
  }, [hsid, pageKey]);

  useEffect(() => {
    if (messages.length < 2) return;
    const duration = Math.max(3, Math.min(120, messages[index]?.duration_seconds || 10));
    const timer = setTimeout(() => setIndex(i => (i + 1) % messages.length), duration * 1000);
    return () => clearTimeout(timer);
  }, [messages, index]);

  // Count the actual next-level flip cards for the selected varsity season.
  // HIGH SCHOOL entries (including coaches) do not count as next-level alumni.
  useEffect(() => {
    let frame = 0;
    const sync = (event?: Event) => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const section = document.getElementById('sec-alltime');
        const isAllTime = section?.classList.contains('visible') || window.location.hash === '#sec-alltime';
        const selected = (event instanceof CustomEvent && event.type === 'yat:alltime-team-year-filter'
          ? String(event.detail?.year || '')
          : section?.dataset.alltimeTeamYearFilter || '').trim();
        if (!isAllTime || !selected) { setTeamAlumniCount(null); return; }
        const ids = new Set<string>();
        document.querySelectorAll<HTMLElement>('#alltime-grid .yat-card[data-playerid]:not([data-superfan-synthetic="true"])').forEach(card => {
          const years = (card.dataset.rosteryears || '').split(',').map(year => year.trim());
          const level = (card.dataset.level || '').trim().toUpperCase();
          const status = (card.dataset.status || '').trim().toUpperCase();
          const id = card.dataset.playerid;
          if (id && years.includes(selected) && level !== 'HIGH SCHOOL' && !/COACH/.test(status)) ids.add(id);
        });
        setTeamAlumniCount(ids.size);
      });
    };
    const onYear = (event: Event) => sync(event);
    const onSection = () => sync();
    window.addEventListener('yat:alltime-team-year-filter', onYear);
    window.addEventListener('hashchange', onSection);
    window.addEventListener('yat:section-changed', onSection);
    window.addEventListener('yat:gallery-filtered', onSection);
    sync();
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('yat:alltime-team-year-filter', onYear);
      window.removeEventListener('hashchange', onSection);
      window.removeEventListener('yat:section-changed', onSection);
      window.removeEventListener('yat:gallery-filtered', onSection);
    };
  }, []);

  const active = messages[index];
  useEffect(() => {
    const element = document.querySelector<HTMLElement>('.yat-unified-footer');
    if (!element) return;
    const image = active?.image_url || '';
    if (image) element.style.setProperty('--yat-footer-campaign-image', `url("${image.replaceAll('"', '%22')}")`);
    else element.style.removeProperty('--yat-footer-campaign-image');
    return () => { element.style.removeProperty('--yat-footer-campaign-image'); };
  }, [active?.image_url]);
  return <div className="yat-page-message-strip" aria-label="Community messages">
    <div className="yat-page-message-hero-space" aria-hidden="true" />
    <div className="yat-page-message-content" aria-live="polite">
      {active ? (active.cta_url
        ? <a href={active.cta_url} className="yat-page-message-copy">{active.message_text}{active.cta_label ? ` — ${active.cta_label}` : ''}</a>
        : <span className="yat-page-message-copy">{active.message_text}</span>)
        : <span className="yat-page-message-copy" />}
    </div>
    <div className="yat-page-message-count" aria-live="polite" aria-label={teamAlumniCount !== null ? `${teamAlumniCount} next level alumni` : `${activeAlumni ?? 'Unknown'} active alumni`}><strong>{teamAlumniCount ?? activeAlumni ?? '—'}</strong><span>{teamAlumniCount !== null ? <>NEXT LEVEL<br/>ALUMNI</> : <>ACTIVE<br/>ALUMNI</>}</span></div>
    <style jsx global>{`
      .yat-page-message-strip{display:flex;align-items:center;position:relative;width:100%;min-width:0;height:var(--yat-message-h,36px);background:var(--bg,#fff);color:var(--fg,#111)}
      .yat-page-message-hero-space{width:var(--yat-card-left-edge,clamp(64px,10vw,110px));height:100%;flex:none}
      .yat-page-message-content{flex:1;min-width:0;display:flex;align-items:center;height:100%;padding:2px 6px 2px 0}
      .yat-page-message-copy{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;max-height:100%;font:700 clamp(9px,1.1vw,13px)/1.12 Arial,sans-serif;letter-spacing:-.015em;color:inherit;text-decoration:none}
      .yat-page-message-count{display:flex;align-items:stretch;justify-content:flex-end;gap:0;flex:none;margin:0 7px 0 3px;padding:2px;background:linear-gradient(135deg,#176c4d,#06402f);border:1px solid #25845e;border-radius:2px;box-shadow:inset 0 0 0 1px #052b21,0 1px 2px #0004;height:30px;box-sizing:border-box}
      .yat-page-message-count strong{display:flex;align-items:center;justify-content:center;min-width:36px;padding:0 5px;background:#042c20;border-radius:2px;font:900 clamp(17px,2.2vw,25px)/1 Arial,sans-serif;color:#fff;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px #000}
      .yat-page-message-count span{display:flex;align-items:center;padding:0 6px;font:900 clamp(7px,.75vw,10px)/1.1 Arial,sans-serif;color:#ffcb22;text-shadow:0 1px 1px #000}
      @media(max-width:640px){
        .yat-page-message-hero-space{width:var(--yat-card-left-edge,clamp(55px,12vw,76px))}
        .yat-page-message-content{padding:1px 3px 1px 0}
        .yat-page-message-copy{font-size:clamp(8px,2vw,10px);line-height:1.1}
        .yat-page-message-count{margin:0 3px 0 2px;padding:2px;height:29px}
        .yat-page-message-count strong{font-size:clamp(16px,4vw,23px);min-width:32px;padding:0 4px}
        .yat-page-message-count span{font-size:7px;padding:0 4px}
      }
    `}</style>
  </div>;
}
