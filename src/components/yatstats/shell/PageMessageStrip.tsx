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

  const active = messages[index];
  return <div className="yat-page-message-strip" aria-label="Community messages">
    <div className="yat-page-message-hero">
      <img src={active?.image_url || 'https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/YaTi.png'} alt="" />
    </div>
    <div className="yat-page-message-content" aria-live="polite">
      {active ? (active.cta_url
        ? <a href={active.cta_url} className="yat-page-message-copy">{active.message_text}{active.cta_label ? ` — ${active.cta_label}` : ''}</a>
        : <span className="yat-page-message-copy">{active.message_text}</span>)
        : <span className="yat-page-message-copy" />}
    </div>
    <div className="yat-page-message-count"><strong>{activeAlumni ?? '—'}</strong><span>ACTIVE<br/>ALUMNI</span></div>
    <style jsx global>{`
      .yat-page-message-strip{display:flex;align-items:center;position:relative;width:100%;min-width:0;height:var(--yat-message-h,36px);background:var(--bg,#fff);color:var(--fg,#111)}
      .yat-page-message-hero{width:clamp(58px,10vw,100px);height:100%;flex:none;position:relative}
      .yat-page-message-hero img{height:calc(100% + 15px);max-width:100%;object-fit:contain;object-position:bottom left;position:absolute;bottom:0;left:0}
      .yat-page-message-content{flex:1;min-width:0;display:flex;align-items:center;height:100%;padding:2px 6px}
      .yat-page-message-copy{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;max-height:100%;font:700 clamp(9px,1.1vw,13px)/1.12 Arial,sans-serif;letter-spacing:-.015em;color:inherit;text-decoration:none}
      .yat-page-message-count{display:flex;align-items:center;justify-content:flex-end;gap:4px;flex:none;padding:0 7px}
      .yat-page-message-count strong{font:800 clamp(17px,2.2vw,30px)/1 Arial,sans-serif;color:#159e65}
      .yat-page-message-count span{font:700 clamp(6px,.7vw,9px)/1.05 Arial,sans-serif}
      @media(max-width:640px){
        .yat-page-message-hero{width:clamp(45px,11vw,66px)}
        .yat-page-message-content{padding:1px 3px}
        .yat-page-message-copy{font-size:clamp(8px,2vw,10px);line-height:1.1}
        .yat-page-message-count{padding:0 3px;gap:2px}
        .yat-page-message-count strong{font-size:clamp(15px,4vw,23px)}
        .yat-page-message-count span{font-size:6px}
      }
    `}</style>
  </div>;
}
