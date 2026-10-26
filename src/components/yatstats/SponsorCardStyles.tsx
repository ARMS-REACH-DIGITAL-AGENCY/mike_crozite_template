/** Sponsor-only rules; the front frame and the gallery geometry stay shared. */
export default function SponsorCardStyles() {
  return <style>{`
    .yat-sponsor-card { cursor:pointer; outline-offset:5px; }
    .yat-sponsor-card:focus-visible { outline:2px solid #fff; }
    .yat-sponsor-card button:focus-visible,.yat-sponsor-card a:focus-visible { outline:2px solid #fff; outline-offset:3px; }
    .yat-sponsor-front .yat-front-flip-button { font-family:inherit; cursor:pointer; }
    .yat-sponsor-front .yat-front-name { overflow-wrap:anywhere; }
    .yat-sponsor-front .yat-bg { background-color:#272b2d; }
    .yat-sponsor-back { container-type:inline-size; container-name:yat-sponsor-back; text-align:left; color:#231d17; }
    .yat-sponsor-paper { width:100%; height:100%; position:relative; overflow:hidden; background-color:#c2b9ae; background-image:repeating-linear-gradient(168deg,transparent 0px,transparent 3px,rgba(255,255,255,.05) 3px,rgba(255,255,255,.05) 4px),repeating-linear-gradient(78deg,transparent 0px,transparent 5px,rgba(0,0,0,.04) 5px,rgba(0,0,0,.04) 6px); }
    .yat-sponsor-back-inner { position:relative; display:flex; flex-direction:column; height:calc(100% - clamp(4px,2cqi,10px) * 2); margin:clamp(4px,2cqi,10px); border:clamp(1.5px,.7cqi,3px) solid rgba(30,22,14,.65); border-radius:clamp(2px,1cqi,5px); overflow:hidden; }
    .yat-sponsor-banner { height:35cqi; min-height:35cqi; position:relative; background:#f6f2e9; border-bottom:1px solid rgba(30,22,14,.45); display:flex; align-items:center; justify-content:center; overflow:hidden; }
    .yat-sponsor-banner img { display:block; width:100%; height:100%; object-fit:contain; }
    .yat-sponsor-banner .yat-sponsor-logo { width:84%; height:76%; }
    .yat-sponsor-banner-name { font-family:var(--yat-font-compact,Arial,sans-serif); text-align:center; font-weight:800; font-size:clamp(15px,7.5cqi,24px); line-height:1.05; padding:12px; overflow-wrap:anywhere; }
    .yat-sponsor-funzone { display:flex; flex:1; flex-direction:column; min-height:0; padding:clamp(8px,4cqi,14px); gap:clamp(6px,2.8cqi,10px); color:#231d17; }
    .yat-sponsor-kicker { font-family:var(--yat-font-compact,Arial,sans-serif); font-size:clamp(8px,3.6cqi,11px); line-height:1.15; text-transform:uppercase; font-weight:800; letter-spacing:.1em; border-bottom:1px solid rgba(30,22,14,.4); padding-bottom:clamp(5px,2.2cqi,8px); }
    .yat-sponsor-message { overflow:auto; overscroll-behavior:contain; min-height:0; flex:1; scrollbar-width:thin; padding-right:2px; }
    .yat-sponsor-message:focus-visible { outline:2px solid #5c3d27; outline-offset:2px; }
    .yat-sponsor-message h3 { font-family:var(--yat-font-compact,Arial,sans-serif); font-size:clamp(17px,8.8cqi,27px); font-weight:800; line-height:1.02; text-transform:uppercase; margin:0 0 clamp(6px,2.8cqi,10px); overflow-wrap:anywhere; }
    .yat-sponsor-message p { white-space:pre-wrap; overflow-wrap:anywhere; font-family:var(--yat-font-ui,Arial,sans-serif); font-size:clamp(10px,4.1cqi,13px); line-height:1.45; margin:0; }
    .yat-sponsor-actions { display:flex; flex-direction:column; gap:6px; flex-shrink:0; }
    .yat-sponsor-cta { display:block; background:#27221c; color:#fff; border:1px solid #27221c; border-radius:2px; padding:clamp(6px,3cqi,10px); text-align:center; font-family:var(--yat-font-compact,Arial,sans-serif); font-size:clamp(10px,4.3cqi,13px); font-weight:800; line-height:1.15; text-decoration:none; overflow-wrap:anywhere; }
    .yat-sponsor-back-flip { align-self:flex-end; appearance:none; background:transparent; color:#30251c; border:0; padding:2px; font:700 clamp(8px,3.3cqi,10px)/1.2 var(--yat-font-ui,Arial,sans-serif); text-transform:uppercase; letter-spacing:.05em; cursor:pointer; }
    .yat-sponsor-back .yat-sponsor-cta:focus-visible,.yat-sponsor-back .yat-sponsor-back-flip:focus-visible { outline-color:#5c3d27; }
    .yat-sponsor-art { display:flex; flex:1; align-items:center; justify-content:center; min-height:0; width:100%; background:#f6f2e9; color:#463c31; }
    .yat-sponsor-art img { display:block; width:100%; height:100%; object-fit:contain; }
    .yat-sponsor-art-placeholder { padding:20px; text-align:center; font:600 13px/1.5 var(--yat-font-ui,Arial,sans-serif); }
    .yat-sponsor-art-flip { flex-shrink:0; margin:4px 6px; padding:2px 3px; }
    .yat-sponsor-gallery { display:contents; }
    @media (prefers-reduced-motion:reduce) { .yat-sponsor-card .yat-flip { transition:none; } }
  `}</style>;
}
