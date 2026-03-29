// src/components/yatstats/profile/ProfileStyles.tsx
// All profile-specific CSS — rendered once by the profile page.
// Shell styles (header, drawers, footer, theme vars) are provided by YatStyles in the layout.

export default function ProfileStyles() {
  return (
    <style>{`
      /* CAREER PROGRESSION FILMSTRIP */
      .career-strip{background:linear-gradient(160deg,#07071a 0%,#0d0d1f 50%,#07071a 100%);padding:0;position:relative;border-bottom:3px solid transparent;border-image:linear-gradient(90deg,#ffd166,#ff9800,#ffd166) 1;height:clamp(100px,12vw,140px);overflow:hidden}
      body.light-theme .career-strip{background:linear-gradient(160deg,#dde0f5 0%,#e8eaf6 50%,#dde0f5 100%)}
      .career-strip-inner{width:100%;height:100%;padding:0;display:flex;gap:0;align-items:stretch;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
      .career-strip-inner::-webkit-scrollbar{display:none}
      .career-slot{display:flex;flex-direction:column;align-items:center;gap:0;flex:0 0 auto;direction:ltr;height:100%;max-height:100%;overflow:hidden;position:relative}
      .career-slot.anchor{width:clamp(72px,10vw,110px);border-right:2px solid rgba(255,209,102,.35)}
      .career-slot.anchor:last-child{border-right:none;border-left:2px solid rgba(255,209,102,.35)}
      .career-slot.anchor .career-slot-img{object-fit:cover;object-position:top center;width:100%;height:100%}
      .career-slot.timeline{width:clamp(60px,8vw,90px);border-right:1px solid var(--line)}
      .career-slot.timeline .career-slot-img{object-fit:contain;object-position:top center;width:100%;flex:1;min-height:0;height:0;display:block}

      /* PLAYER METADATA BAND */
      .player-meta-band{max-width:1100px;margin:0 auto;padding:7px 16px;display:flex;gap:0;align-items:flex-start;border-bottom:1px solid var(--line);position:sticky;top:var(--stickyHeaderH,120px);z-index:45;background:var(--header-bg);backdrop-filter:blur(8px)}
      .pmb-left{flex:0 0 60%;display:flex;flex-direction:column;gap:2px;padding-right:8px}
      .pmb-right{flex:0 0 40%;display:flex;flex-direction:column;gap:2px;text-align:right}
      .pmb-line{font:300 11px/1.15 Oswald,sans-serif;letter-spacing:.04em;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pmb-line.dim{color:var(--muted)}
      .pmb-line .sep{color:var(--muted);margin:0 4px;font-weight:300}
      .pmb-line strong{font-weight:500}

      /* PROFILE TABS */
      .profile-tabs{display:flex;gap:0;border-bottom:2px solid var(--line);max-width:1100px;margin:12px auto 0;padding:0 16px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;position:sticky;top:calc(var(--stickyHeaderH,120px) + var(--metaBandH,60px));z-index:40;background:var(--header-bg);backdrop-filter:blur(8px)}
      .profile-tabs::-webkit-scrollbar{display:none}
      .profile-tab{font:700 12px/1 "Bebas Neue",sans-serif;letter-spacing:.08em;padding:10px 18px;cursor:pointer;color:var(--muted);border-bottom:3px solid transparent;margin-bottom:-2px;transition:color .2s,border-color .2s;white-space:nowrap;flex-shrink:0}
      .profile-tab.active{color:var(--fg);border-bottom-color:gold}
      .profile-tab:hover:not(.active){color:var(--fg)}

      /* STATS */
      .stats-section{max-width:1100px;margin:0 auto;padding:20px 16px}
      .stats-title{font:700 12px/1 "Bebas Neue",sans-serif;letter-spacing:.1em;text-align:center;padding:10px;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:6px 6px 0 0;color:var(--muted);text-transform:uppercase}
      body.light-theme .stats-title{background:rgba(0,0,0,.03)}
      .stats-grid{display:grid;grid-template-columns:repeat(6,1fr);border:1px solid var(--line);border-top:none;margin-bottom:16px}
      @media(max-width:660px){.stats-grid{grid-template-columns:repeat(3,1fr)}}
      .stat-cell{text-align:center;padding:14px 8px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
      .stats-grid .stat-cell:nth-child(6n){border-right:none}
      @media(max-width:660px){.stats-grid .stat-cell:nth-child(6n){border-right:1px solid var(--line)}.stats-grid .stat-cell:nth-child(3n){border-right:none}}
      .stat-label{font:300 9px/1 Oswald,sans-serif;letter-spacing:.1em;color:var(--muted);text-transform:uppercase}
      .stat-value{font:700 22px/1 "Bebas Neue",sans-serif;margin-top:6px}
      .season-note{text-align:center;font:300 12px/1.3 Oswald,sans-serif;color:var(--muted);margin:8px 0}

      /* TABLES */
      .table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:6px;margin-top:4px}
      .season-table{width:100%;border-collapse:collapse;font:300 12px/1.4 Oswald,sans-serif}
      .season-table thead{position:sticky;top:0;z-index:2}
      .season-table th{font:700 10px/1 "Bebas Neue",sans-serif;letter-spacing:.1em;padding:8px 6px;text-align:center;color:var(--muted);text-transform:uppercase;white-space:nowrap;background:var(--card-bg);box-shadow:0 1px 0 var(--line),0 2px 0 var(--line)}
      body.light-theme .season-table th{background:#e8eaf0}
      .season-table td{padding:8px 6px;text-align:center;border-bottom:1px solid var(--line);white-space:nowrap}
      .season-table tr:last-child td{border-bottom:none}
      .season-table tbody tr:hover{background:rgba(255,209,102,.05)}

      /* TAB CONTENT */
      .tab-content{display:none;scroll-margin-top:calc(var(--stickyHeaderH,120px) + var(--metaBandH,60px) + var(--tabBarH,42px) + 8px)}
      .tab-content.active{display:block;min-height:calc(100svh - var(--stickyHeaderH,120px) - var(--metaBandH,60px) - var(--tabBarH,42px) - var(--footerH))}
      .coming-soon{text-align:center;padding:48px 20px;color:var(--muted);font:300 14px/1.5 Oswald,sans-serif}
      .coming-soon i{font-size:36px;display:block;margin-bottom:12px;opacity:.4}

      /* FAVORITES MODAL */
      .fav-modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:60}
      .fav-modal{background:var(--card-bg);border:1px solid var(--line);border-radius:16px;padding:24px;max-width:380px;width:90%;color:var(--fg);box-shadow:0 20px 40px rgba(0,0,0,.4);position:relative}
      .fav-modal h3{font:700 20px/1 "Bebas Neue",sans-serif;letter-spacing:.08em;margin-bottom:8px}
      .fav-modal p{font:300 13px/1.5 Oswald,sans-serif;color:var(--muted);margin-bottom:16px}
      .fav-modal-actions{display:flex;flex-direction:column;gap:8px}
      .fav-modal-actions button{padding:11px 14px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--fg);font:700 12px/1 "Bebas Neue",sans-serif;letter-spacing:.08em;cursor:pointer;transition:background .15s}
      body.light-theme .fav-modal-actions button{background:rgba(0,0,0,.04)}
      .fav-modal-actions button.cta{background:gold;color:#000;border-color:gold}
      .fav-modal-close{position:absolute;top:12px;right:14px;background:none;border:none;color:var(--muted);cursor:pointer;font-size:20px;line-height:1}

      /* PLAYER CONTEXT LINE */
      .player-context-line{font:300 11px/1.3 Oswald,sans-serif;letter-spacing:.08em;color:var(--muted);text-transform:uppercase}
      .player-context-line .ctx-team{color:var(--fg);font-weight:500}

      /* OVERVIEW TAB */
      .overview-section{max-width:1100px;margin:0 auto;padding:20px 16px}
      .ov-card{background:var(--card-bg);border:1px solid var(--line);border-radius:8px;padding:18px 20px;margin-bottom:16px}
      .ov-card-title{font:700 11px/1 "Bebas Neue",sans-serif;letter-spacing:.12em;color:var(--muted);text-transform:uppercase;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--line)}

      /* CAREER LOG TABLE */
      .career-log-title{font:700 12px/1 "Bebas Neue",sans-serif;letter-spacing:.1em;padding:10px 14px;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:6px 6px 0 0;color:var(--muted);text-transform:uppercase;display:flex;align-items:center;gap:8px}
      body.light-theme .career-log-title{background:rgba(0,0,0,.03)}
      .career-log .year-cell{font:700 12px/1 Oswald,sans-serif;color:var(--fg)}
      .career-log .team-cell{font:400 11px/1.3 Oswald,sans-serif;color:var(--muted);text-align:left;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .career-log tbody tr.level-row{border-left:3px solid transparent}
      .career-log tbody tr.level-mlb{border-left-color:#1d6fa4}
      .career-log tbody tr.level-aaa{border-left-color:#c8102e}
      .career-log tbody tr.level-aa{border-left-color:#e07b39}
      .career-log tbody tr[class*="level-a"]{border-left-color:#f5a623}
      .career-log tbody tr.level-ind{border-left-color:#6a0dad}
      .career-log tbody tr.level-coll{border-left-color:#2ecc71}
      .career-log tbody tr.level-rok{border-left-color:#27ae60}
      .career-log tbody .career-totals-row{background:rgba(255,209,102,.08);font-weight:700}
      body.light-theme .career-log tbody .career-totals-row{background:rgba(255,209,102,.12)}
      .career-log tbody .career-totals-row td{font:700 12px/1.4 Oswald,sans-serif;border-top:2px solid rgba(255,209,102,.3)}
      .career-log tbody .career-totals-row .year-cell{color:gold}
      .log-section{margin-bottom:20px}

      /* GAME LOG FEED */
      .gl-feed{background:var(--card-bg);border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:16px}
      .gl-feed-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.04)}
      body.light-theme .gl-feed-header{background:rgba(0,0,0,.03)}
      .gl-feed-title{font:700 12px/1 "Bebas Neue",sans-serif;letter-spacing:.1em;color:var(--muted);text-transform:uppercase;display:flex;align-items:center;gap:6px}
      .gl-feed-team{font:400 12px/1 Oswald,sans-serif;color:var(--fg);letter-spacing:.04em}
      .gl-row{display:flex;align-items:baseline;gap:0;padding:8px 14px;border-bottom:1px solid var(--line);min-height:36px}
      .gl-row:last-child{border-bottom:none}
      .gl-row.gl-row-past{background:rgba(255,255,255,.01)}
      .gl-row.gl-row-today{background:rgba(255,209,102,.07);border-left:3px solid gold}
      body.light-theme .gl-row.gl-row-today{background:rgba(255,209,102,.1)}
      .gl-date{font:700 11px/1 "Bebas Neue",sans-serif;letter-spacing:.04em;min-width:38px;flex-shrink:0;color:var(--fg)}
      .gl-row.gl-row-past .gl-date{color:var(--muted)}
      .gl-matchup{font:400 11px/1 Oswald,sans-serif;min-width:120px;flex-shrink:0;color:var(--fg)}
      .gl-row.gl-row-past .gl-matchup{color:var(--muted)}
      .gl-result{font:700 11px/1 "Bebas Neue",sans-serif;min-width:28px;flex-shrink:0;margin-left:4px}
      .gl-result.win{color:#00e676}
      .gl-result.loss{color:#ff5252}
      .gl-stat-line{font:400 11px/1 Oswald,sans-serif;color:var(--fg);flex:1;padding-left:8px;border-left:1px solid var(--line);margin-left:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .gl-status{font:700 8px/1 "Bebas Neue",sans-serif;letter-spacing:.08em;padding:3px 7px;border-radius:3px;background:rgba(255,209,102,.15);color:gold;border:1px solid rgba(255,209,102,.3);flex-shrink:0;margin-left:6px;white-space:nowrap;align-self:center}
      .gl-status.live{background:rgba(0,230,118,.15);color:#00e676;border-color:rgba(0,230,118,.4)}
      .gl-empty{padding:32px 16px;text-align:center;font:300 12px/1.4 Oswald,sans-serif;color:var(--muted)}
      @media(max-width:640px){
        .gl-row{padding:7px 10px;gap:0}
        .gl-date{min-width:32px;font-size:10px}
        .gl-matchup{min-width:90px;font-size:10px}
        .gl-result{font-size:10px}
        .gl-stat-line{font-size:10px}
      }

      /* FAV TOAST */
      .fav-toast{position:fixed;bottom:calc(var(--footerH,48px) + 12px);left:50%;transform:translateX(-50%) translateY(12px);background:rgba(22,163,74,.95);color:#fff;padding:10px 20px;border-radius:8px;font:600 13px Oswald,sans-serif;letter-spacing:.05em;z-index:200;opacity:0;transition:opacity .3s,transform .3s;pointer-events:none;white-space:nowrap}
      .fav-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}

      /* FAV BUTTON */
      .fav-btn-hero{display:inline-flex;align-items:center;gap:5px;padding:0;border:none;background:none;color:var(--fg);font:700 11px/1 "Bebas Neue",sans-serif;letter-spacing:.06em;cursor:pointer;white-space:nowrap;transition:opacity .2s}
      .fav-btn-hero i{font-size:15px;transition:color .2s}
      .fav-btn-hero:hover{opacity:.7}
      .fav-btn-hero.active i{color:gold}
    `}</style>
  );
}
