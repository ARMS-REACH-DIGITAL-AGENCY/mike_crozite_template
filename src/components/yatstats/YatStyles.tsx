// src/components/yatstats/YatStyles.tsx
// All page-level CSS for the YAT?STATS school microsite

export default function YatStyles() {
  return (
    <style>{`
      :root{--bg:#0c0c0c;--fg:#f2f2f2;--muted:#c4c4c4;--ink:#e8e8e8;--line:rgba(255,255,255,.08);--card-bg:#171717;--header-bg:#000;--drawer-bg:rgba(10,10,10,.95);--shade-end:rgba(0,0,0,.95);--hamSmall:13px;--hamBig:20px;--hamBigger:24px;--tagGrey:#cfd2d6;--crestH:clamp(42px,6.3vw,74px);--footerH:clamp(56px,8vh,77px);--green:#00e676;--gold:#ffc107;--blue:#42a5f5;--purple:#ce93d8;--orange:#ff9800;--logo-filter:invert(1);--row1-h:50px;--row2-h:calc(var(--crestH) + 8px)}
      body.light-theme{--bg:#f4f4f4;--fg:#121212;--muted:#555;--ink:#222;--line:rgba(0,0,0,.1);--card-bg:#fff;--header-bg:#fff;--drawer-bg:rgba(255,255,255,.97);--tagGrey:#555;--shade-end:rgba(0,0,0,.85);--logo-filter:none}
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html{scroll-behavior:smooth}
      body{background:var(--bg);color:var(--fg);font-family:Oswald,system-ui,sans-serif;-webkit-font-smoothing:antialiased;padding-bottom:var(--footerH);transition:background-color .3s,color .3s}
      body.drawer-open{overflow:hidden}
      a{color:inherit;text-decoration:none}

      .yat-container{width:100%;max-width:1280px;margin:0 auto;padding:0 16px}

      .yat-row1-shell{
        position:sticky;
        top:0;
        z-index:70;
        background:var(--header-bg);
        transition:background-color .3s;
      }

      .yat-row2-shell{
        position:sticky;
        top:var(--row1-h);
        z-index:65;
        background:var(--header-bg);
        border-top:1px solid var(--line);
        border-bottom:1px solid var(--line);
      }

      .yat-row3-shell{
        position:sticky;
        top:calc(var(--row1-h) + var(--row2-h));
        z-index:60;
        background:var(--header-bg);
        border-bottom:1px solid var(--line);
      }

      .yat-row4-shell{
        position:relative;
        z-index:5;
        background:var(--bg);
        border-bottom:1px solid var(--line);
      }

      .yat-row5-shell{
        position:relative;
        z-index:1;
        padding-top:8px;
      }

      .yat-row6-shell{
        z-index:40;
      }

      [id^="player-"]{
        scroll-margin-top:200px;
      }

      .yat-topbar{
        display:grid;
        grid-template-columns:auto 1fr auto;
        align-items:center;
        min-height:44px;
        padding:3px 8px;
        column-gap:8px;
        background:var(--header-bg);
      }

      .yat-topbar-left{
        display:flex;
        align-items:center;
        gap:4px;
        white-space:nowrap;
      }

      .yat-topbar-right{
        width:0;
        min-width:0;
      }

      .yat-icon-btn{
        background:none;
        border:none;
        color:var(--fg);
        opacity:.92;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:28px;
        height:28px;
        padding:0;
        margin:0;
        cursor:pointer;
        flex:0 0 auto;
      }

      .yat-icon-btn i{font-size:15px}
      .yat-icon-btn:focus{outline:2px solid var(--fg);outline-offset:2px}

      .yat-wordmark-wrap{
        display:flex;
        align-items:center;
        justify-content:flex-end;
        min-width:0;
        width:100%;
        white-space:nowrap;
      }

      .yat-wordmark-img{
        filter:var(--logo-filter);
        height:20px;
        width:auto;
        display:block;
        max-width:100%;
      }

      @media(max-width:1200px){.yat-topnav{display:none!important}}
      .yat-hr{border-top:1px solid var(--line)}

      .yat-schoolrow{
        display:flex;
        align-items:center;
        gap:0px;
        padding:6px 12px;
        max-width:1400px;
        margin:0 auto;
        background:var(--header-bg);
      }

      .yat-crest{
        height:calc(var(--crestH) - 4px);
        width:auto;
        object-fit:contain;
        display:block;
        flex-shrink:0;
      }

      .yat-schooltext{line-height:1;min-width:0}
      .yat-schooltext .small{font:300 11px/1 Oswald;letter-spacing:.12em;color:var(--muted);text-transform:uppercase}
      .yat-schooltext .big1{
        font:700 16px/1.02 "Bebas Neue",sans-serif;
        letter-spacing:.02em;
        text-transform:uppercase;
        white-space:nowrap;
      }
      .yat-schooltext .big2{
        font:700 15px/1 "Bebas Neue",sans-serif;
        letter-spacing:.02em;
        text-transform:uppercase;
        margin-top:0;
        white-space:nowrap;
      }

      @media(max-width:640px){
        :root{--crestH:40px;--row1-h:50px;--row2-h:calc(var(--crestH) + 6px)}

        .yat-row2-shell{
          top:var(--row1-h);
        }

        .yat-row3-shell{
          top:calc(var(--row1-h) + var(--row2-h));
        }

        .yat-schoolrow{
          padding:5px 10px;
          gap:0px;
          background: var(--header-bg);
        }

        .yat-schooltext .small{
          font-size:8px;
          letter-spacing:.05em;
        }

        .yat-schooltext .big1{
          font-size:12px;
          line-height:1;
        }

        .yat-schooltext .big2{
          font-size:12px;
          line-height:1;
        }
      }

      .yat-hero{
        padding:4px 0;
        position:relative;
      }

      .yat-hero-grid{
        display:flex;
        align-items:center;
        justify-content:center;
        gap:16px;
        padding:2px 0;
        min-height:30px;
      }

      .yat-hero-left{
        display:flex;
        flex-direction:column;
        gap:2px;
        padding-left:0;
        align-items:center;
      }

      .yat-hero-right{
        display:flex;
        gap:0;
        padding-top:0;
        margin-left:auto;
        flex-shrink:0;
        align-items:center;
      }

      .yat-hero-right .yat-icon-btn{
        width:28px;
        height:28px;
      }

      .yat-hero-right .yat-icon-btn i{
        font-size:16px;
      }

      .yat-tag-duo{
        position:relative;
        height:1.35em;
        font-size:16px;
        min-width:180px;
        text-align:center;
      }

      .yat-tag-swap{position:absolute;left:0;top:0;right:0;opacity:0;animation:yatswap 6s infinite;white-space:nowrap}
      .yat-tag-swap:nth-child(1){animation-delay:0s}
      .yat-tag-swap:nth-child(2){animation-delay:3s}
      .yat-tag-grey{font:300 1em Oswald,sans-serif;letter-spacing:.02em;color:var(--tagGrey)}
      body.light-theme .yat-tag-grey{color:var(--muted)}
      .yat-tag-bold{font:400 1em "Bebas Neue",sans-serif}
      @keyframes yatswap{0%{opacity:0}5%{opacity:1}45%{opacity:1}50%{opacity:0}100%{opacity:0}}

      .gallery-strip{
        position:relative;
        max-width:1400px;
        margin:0 auto;
        padding:0;
        min-height:100px;
        display:flex;
        align-items:center;
        overflow:hidden;
        background:var(--header-bg);
      }

      .gallery-strip-inner{
        width:100%;
        display:flex;
        gap:0;
        overflow-x:auto;
        overflow-y:hidden;
        scroll-behavior:smooth;
        -webkit-overflow-scrolling:touch;
        scrollbar-width:none;
        -ms-overflow-style:none;
        align-items:stretch;
        padding:0 18px;
        min-height:100px;
      }

      .gallery-strip-inner::-webkit-scrollbar{
        display:none;
        width:0;
        height:0;
        background:transparent;
      }

      .gallery-slot{
        flex:0 0 auto;
        width:72px;
        height:100px;
        min-width:72px;
        overflow:hidden;
        border:none;
        border-radius:0;
        background:#111;
        display:block;
        position:relative;
        transform:translateY(0) scale(1);
        transition:transform .16s ease, filter .16s ease, box-shadow .16s ease, opacity .16s ease;
      }

      .gallery-slot + .gallery-slot{
        margin-left:1px;
      }

      .gallery-slot:hover,
      .gallery-slot:focus,
      .gallery-slot.is-active{
        transform:translateY(-2px) scale(1.05);
        z-index:3;
        box-shadow:0 0 0 1px rgba(255,255,255,.2);
        filter:brightness(1.08);
      }

      .gallery-slot:active{
        transform:translateY(0) scale(0.98);
      }

      .gallery-slot-img{
        width:100%;
        height:100%;
        object-fit:cover;
        object-position:center top;
        display:block;
        background:#000;
      }

      .gallery-strip-arrow{
        position:absolute;
        top:50%;
        transform:translateY(-50%);
        width:22px;
        height:22px;
        border:none;
        border-radius:0;
        background:rgba(0,0,0,.8);
        color:#fff;
        cursor:pointer;
        display:grid;
        place-items:center;
        z-index:4;
        font-size:20px;
        line-height:1;
      }

      .gallery-strip-arrow.left{left:0}
      .gallery-strip-arrow.right{right:0}
      .gallery-strip-arrow.hidden{opacity:0;pointer-events:none}

      .profile-strip-placeholder{
        min-height:56px;
      }

      .yat-chip{display:inline-block;font:700 9px/1 Oswald,sans-serif;letter-spacing:.1em;text-transform:uppercase;padding:2px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.5);color:#fff}
      body.light-theme .yat-chip{border-color:rgba(0,0,0,.2);background:rgba(0,0,0,.08);color:#222}
      .chip-mlb{background:rgba(0,230,118,.15);border-color:#00e676;color:#00e676}
      .chip-aaa{background:rgba(255,193,7,.12);border-color:#ffc107;color:#ffc107}
      .chip-aa{background:rgba(66,165,245,.12);border-color:#42a5f5;color:#42a5f5}
      .chip-aplus{background:rgba(206,147,216,.12);border-color:#ce93d8;color:#ce93d8}
      .chip-a{background:rgba(255,152,0,.1);border-color:#ff9800;color:#ff9800}
      .chip-indy{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.25);color:#ccc}
      .chip-ncaa{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.15);color:#aaa}
      .chip-other{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.1);color:#888}
      .chip-sm{font-size:8px;padding:2px 5px}
      .front-chip{background:rgba(0,0,0,.55);color:#fff;border-radius:6px;padding:2px 6px;font-weight:700;font-family:Oswald,sans-serif;border:1px solid rgba(255,255,255,.2);text-transform:uppercase;font-size:10px}
      .yat-section{display:none}
      .yat-section.visible{display:block}
      .yat-grid{max-width:1400px;margin:0 auto;padding:16px;display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
      @media(max-width:1400px){.yat-grid{grid-template-columns:repeat(4,1fr)}}
      @media(max-width:1100px){.yat-grid{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:768px){.yat-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:520px){.yat-grid{grid-template-columns:1fr}}
      .yat-card{position:relative;background:var(--card-bg);overflow:hidden;box-shadow:0 4px 8px rgba(0,0,0,.2)}
      .yat-card::before{content:"";display:block;padding-top:140%}
      .yat-card-inner{position:absolute;inset:0;perspective:1200px}
      .yat-flip{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .6s cubic-bezier(.2,.7,.2,1)}
      .yat-card.is-flipped .yat-flip{transform:rotateY(180deg)}
      .yat-face{position:absolute;inset:0;backface-visibility:hidden}
      .yat-card:not(.is-flipped) .yat-back{pointer-events:none}
      .yat-card.is-flipped .yat-front{pointer-events:none}
      .yat-card .yat-back a,.yat-card .yat-back button{pointer-events:auto}
      .yat-face.yat-front{display:flex;flex-direction:column;justify-content:flex-end}
      .yat-bg{position:absolute;inset:0;background:#111 center/cover no-repeat}
      .yat-shade{position:absolute;left:0;right:0;bottom:0;height:70%;background:linear-gradient(transparent,rgba(0,0,0,.3) 30%,var(--shade-end))}
      .yat-front-content{position:absolute;inset:0;padding:12px;display:flex;flex-direction:column;justify-content:space-between}
      .yat-chips-col{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
      .yat-info-block{display:flex;flex-direction:column;align-items:flex-start;gap:6px}
      .yat-name{font-family:"Bebas Neue",sans-serif;letter-spacing:.02em;color:#fff;text-shadow:1px 1px 3px rgba(0,0,0,.5);text-transform:uppercase;font-size:28px}
      .yat-name span{display:block;line-height:.9}
      @media(max-width:1400px){.yat-name{font-size:26px}}
      @media(max-width:1100px){.yat-name{font-size:24px}}
      @media(max-width:768px){.yat-name{font-size:22px}}
      .yat-meta{font-family:Oswald,sans-serif;opacity:.9;color:#fff;text-shadow:1px 1px 3px rgba(0,0,0,.5);font-size:13px}
      .yat-meta span{display:block;line-height:1.1}
      .yat-dots{display:flex;gap:4px}
      .yat-dot{width:22px;height:22px;border-radius:50%;background:#fff;color:#111;display:grid;place-items:center;font-weight:700;font-size:10px;border:1px solid rgba(0,0,0,.2)}
      .yat-game-block{margin-top:4px}
      .yat-pill{background:rgba(0,0,0,.5);color:#fff;border-radius:20px;padding:3px 10px;font-family:Oswald,sans-serif;border:1px solid rgba(255,255,255,.15);text-transform:uppercase;font-weight:700;display:inline-block;font-size:10px}
      .yat-game-text{font-family:Oswald;color:#fff;text-shadow:1px 1px 3px rgba(0,0,0,.5);font-size:13px;line-height:1.2}
      .yat-game-text span{display:block}
      .yat-log{font-family:system-ui,sans-serif;white-space:normal;line-height:1.2;letter-spacing:-.5px;display:block;font-size:10px}
      .yat-face.yat-back{transform:rotateY(180deg);background:#111;color:var(--fg);--fg:#f2f2f2;--muted:#9e9e9e;--line:rgba(255,255,255,.1);--card-bg:#1a1a1a}
      .yat-back-content{position:absolute;inset:0;display:flex;flex-direction:column;z-index:1;overflow:hidden}
      .yat-back-hero{display:flex;flex-direction:column;flex-shrink:0;text-decoration:none;color:inherit}
      .yat-back-hero:hover .yat-back-name{opacity:.75}
      .yat-back-img-wrap{width:100%;padding-bottom:40%;position:relative;overflow:hidden;background:#111;flex-shrink:0}
      .yat-back-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
      .yat-back-info{padding:7px 10px;background:rgba(17,17,17,.9);border-bottom:1px solid var(--line)}
      .yat-back-name{font:700 18px "Bebas Neue",sans-serif;letter-spacing:.04em;margin-bottom:2px}
      .yat-back-details{font-size:10px;opacity:.8;line-height:1.3}
      .yat-back-draft{font:300 9px/1.3 Oswald,sans-serif;color:var(--muted);margin-top:2px}
      .yat-back-stats{flex:1 1 0;padding:7px 8px;overflow:hidden;display:flex;flex-direction:column;min-height:0}
      .yat-stats-bar{background:var(--line);color:var(--fg);text-align:center;padding:4px;font:700 10px "Bebas Neue",sans-serif;margin:0 0 5px;border-radius:4px;flex-shrink:0}
      .yat-stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;text-align:center}
      .yat-stat{background:var(--line);border-radius:6px;padding:3px 2px;display:flex;flex-direction:column;justify-content:center}
      .yat-stat-label{font-size:8px;text-transform:uppercase;opacity:.7}
      .yat-stat-val{font-size:13px;font-weight:700;line-height:1;margin-top:2px}
      .yat-fun-zone{border-top:1px solid var(--line);padding:4px 8px;flex-shrink:0;background:rgba(0,0,0,.3)}
      .yat-fun-label{font:700 8px "Bebas Neue",sans-serif;letter-spacing:.1em;opacity:.5;text-align:center;text-transform:uppercase}
      .yat-table-wrap{max-width:1400px;margin:0 auto;padding:20px 16px;overflow-x:auto}
      .yat-table{width:100%;border-collapse:collapse;font:400 12px/1.4 Oswald,sans-serif}
      .yat-table th{font:600 9px/1 Oswald,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap;background:var(--card-bg)}
      .yat-table th.num{text-align:right}
      .yat-table td{padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
      .yat-table td.num{text-align:right;color:var(--muted);font-size:11px}
      .yat-table td.hi{color:#00e676;font-weight:600}
      .yat-table tr:hover td{background:rgba(255,255,255,.025)}
      .yat-active-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#00e676;margin-right:5px;vertical-align:middle}

      .yat-drawer-mask{
        position:fixed;
        inset:0;
        background:rgba(0,0,0,.45);
        opacity:0;
        pointer-events:none;
        transition:opacity .2s ease;
        z-index:10010
      }

      body.drawer-left-open .yat-drawer-mask,
      body.drawer-right-open .yat-drawer-mask,
      body.drawer-account-open .yat-drawer-mask{
        opacity:1;
        pointer-events:auto
      }

      .yat-drawer{
        position:fixed;
        top:0;
        bottom:0;
        width:min(86vw,360px);
        background:var(--drawer-bg);
        backdrop-filter:blur(4px);
        color:var(--ink);
        z-index:10020;
        display:flex;
        flex-direction:column;
        overflow-y:auto;
        box-shadow:0 0 24px rgba(0,0,0,.35);
        transition:transform .28s ease,background-color .3s
      }

      .yat-drawer-left{
        left:0;
        transform:translateX(-102%);
        border-right:1px solid var(--line)
      }

      .yat-drawer-right{
        right:0;
        left:auto;
        transform:translateX(102%);
        border-left:1px solid var(--line)
      }

      body.drawer-left-open #drawerLeft{transform:translateX(0)}
      body.drawer-right-open #drawerFilters{transform:translateX(0)}
      body.drawer-account-open #drawerAccount{transform:translateX(0)}

      .yat-drawer h3{
        margin:18px 16px 8px;
        padding-right:30px;
        font:700 16px "Bebas Neue",sans-serif;
        letter-spacing:.06em
      }

      .yat-drawer .yat-close-btn{
        position:absolute;
        top:12px;
        right:12px
      }

      .yat-drawer-content{
        flex-grow:1;
        overflow-y:auto;
        padding:10px 16px;
        display:flex;
        flex-direction:column;
        gap:14px
      }

      .yat-drawer-nav{
        display:flex;
        flex-direction:column;
        gap:12px
      }

      .yat-drawer-nav-item{
        font:400 14px Oswald,sans-serif;
        padding:8px 0;
        border-bottom:1px solid var(--line);
        cursor:pointer;
        color:var(--ink)
      }

      .yat-drawer-nav-item:hover{
        color:var(--fg)
      }

      .yat-drawer-footer{
        flex-shrink:0;
        padding:12px 16px;
        border-top:1px solid var(--line);
        display:flex;
        gap:10px;
        align-items:center
      }

      .yat-drawer input[type="text"],
      .yat-drawer input[type="search"]{
        width:100%;
        padding:10px;
        border-radius:10px;
        border:1px solid var(--line);
        background:rgba(255,255,255,.06);
        color:var(--ink);
        font-family:Oswald,sans-serif;
        font-size:13px
      }

      body.light-theme .yat-drawer input{
        background:rgba(0,0,0,.06)
      }

      .yat-filter-group{border-bottom:1px solid var(--line);padding:8px 0}
      .yat-filter-group summary{font:600 12px Oswald,sans-serif;letter-spacing:.06em;cursor:pointer;padding:4px 0;text-transform:uppercase;color:var(--muted)}
      .yat-filter-options{padding:8px 0;display:flex;flex-direction:column;gap:6px}
      .yat-filter-options label{display:flex;align-items:center;gap:8px;font:400 12px Oswald,sans-serif;cursor:pointer}
      #liveResults{margin:10px 4px 18px;max-height:55vh;overflow:auto}
      .yat-live-hit{padding:10px 12px;display:flex;align-items:center;gap:10px;border-radius:10px;cursor:pointer}
      .yat-live-hit:hover{background:var(--line)}
      .yat-placeholder{max-width:1400px;margin:0 auto;padding:60px 16px;text-align:center}
      .yat-placeholder-icon{font-size:48px;margin-bottom:16px;opacity:.3}
      .yat-placeholder-title{font:700 24px "Bebas Neue",sans-serif;letter-spacing:.06em;margin-bottom:8px}
      .yat-placeholder-body{font:300 13px/1.6 Oswald,sans-serif;color:var(--muted);max-width:480px;margin:0 auto}
      .yat-sec-header{max-width:1400px;margin:0 auto;padding:16px 16px 8px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
      .yat-sec-title{font:700 clamp(13px,2vw,16px)/1 "Bebas Neue",Oswald,sans-serif;letter-spacing:.1em;color:var(--fg);text-transform:uppercase}
      .yat-sec-sub{font:300 11px/1.5 Oswald,sans-serif;color:var(--muted);margin-top:4px;letter-spacing:.06em}
      .yat-legend{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
      .yat-empty{grid-column:1/-1;text-align:center;padding:60px 0;opacity:.4}
      .yat-empty-icon{font-size:32px;margin-bottom:12px}
      .yat-empty-title{font:700 18px "Bebas Neue",Oswald,sans-serif;letter-spacing:.06em}
      .yat-empty-sub{font:300 12px/1.5 Oswald,sans-serif;margin-top:6px}
      .yat-footer{position:fixed;left:0;right:0;bottom:0;height:var(--footerH);background:var(--bg);border-top:1px solid var(--line);z-index:40;display:flex;align-items:center;justify-content:center;gap:24px;padding:0 16px}
      .yat-footer .sponsor-text{font:300 10px/1 Oswald,sans-serif;letter-spacing:.1em;color:var(--muted);text-transform:uppercase}
      .yat-footer .sponsor-name{font:400 16px "Bebas Neue",sans-serif;letter-spacing:.06em;color:var(--fg)}
      .yat-footer a{display:flex;flex-direction:column;align-items:center;gap:2px}
      .yat-footer a:hover{opacity:.8}

      /* ── Global Search Modal ─────────────────────────────────────────── */
      .yat-gs-modal{display:none;position:fixed;inset:0;z-index:90;align-items:flex-start;justify-content:center;padding:10vh 16px 16px}
      .yat-gs-modal.open{display:flex}
      .yat-gs-overlay{position:absolute;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(6px)}
      .yat-gs-panel{position:relative;width:100%;max-width:620px;background:#111;border:1px solid rgba(255,255,255,.1);border-radius:18px;box-shadow:0 24px 64px rgba(0,0,0,.7);display:flex;flex-direction:column;overflow:hidden;max-height:82vh}
      body.light-theme .yat-gs-panel{background:#fff;border-color:rgba(0,0,0,.12)}
      .yat-gs-header{display:flex;align-items:flex-start;justify-content:space-between;padding:20px 20px 0}
      .yat-gs-title{font:700 24px "Bebas Neue",sans-serif;letter-spacing:.08em;color:var(--fg);text-transform:uppercase}
      .yat-gs-sub{font:300 11px Oswald,sans-serif;color:var(--muted);margin-top:2px;letter-spacing:.05em;text-transform:uppercase}
      .yat-gs-body{padding:14px 16px 14px;display:flex;flex-direction:column;gap:10px;min-height:0}
      .yat-gs-input-wrap{position:relative;display:flex;align-items:center}
      .yat-gs-input-wrap .ri-search-line{position:absolute;left:14px;font-size:16px;color:var(--muted);pointer-events:none}
      .yat-gs-input{width:100%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:12px;color:var(--fg);font:400 14px Oswald,sans-serif;padding:10px 14px 10px 40px;outline:none;transition:border-color .2s}
      body.light-theme .yat-gs-input{background:rgba(0,0,0,.05);border-color:rgba(0,0,0,.15)}
      .yat-gs-input:focus{border-color:rgba(255,255,255,.38)}
      body.light-theme .yat-gs-input:focus{border-color:rgba(0,0,0,.3)}
      .yat-gs-results{overflow-y:auto;max-height:calc(82vh - 180px);display:flex;flex-direction:column;gap:6px;padding-bottom:6px}
      .yat-gs-section{font:700 10px Oswald,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);padding:10px 2px 4px;border-top:1px solid var(--line);margin-top:2px;flex-shrink:0}
      .yat-gs-section:first-child{border-top:none;margin-top:0;padding-top:4px}
      .yat-gs-region{font:700 9px Oswald,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);padding:14px 2px 6px;border-top:1px solid var(--line);margin-top:2px;flex-shrink:0}
      .yat-gs-region:first-child{border-top:none;margin-top:0;padding-top:4px}
      .yat-gs-result{display:flex;flex-direction:column;gap:0;padding:0;border-radius:12px;text-decoration:none;color:inherit;cursor:pointer;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);transition:background .15s,border-color .15s;overflow:hidden;flex-shrink:0}
      .yat-gs-result:hover,.yat-gs-result:focus{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.2);outline:none}
      body.light-theme .yat-gs-result{background:rgba(0,0,0,.03);border-color:rgba(0,0,0,.08)}
      body.light-theme .yat-gs-result:hover{background:rgba(0,0,0,.06);border-color:rgba(0,0,0,.14)}
      .yat-gs-result[data-status="inactive"]{opacity:.6}
      .yat-gs-result-top{display:flex;align-items:center;gap:12px;padding:12px 14px 10px}
      .yat-gs-result-crest{width:44px;height:44px;border-radius:8px;object-fit:contain;background:rgba(255,255,255,.06);flex-shrink:0;border:1px solid rgba(255,255,255,.1);padding:2px}
      body.light-theme .yat-gs-result-crest{background:rgba(0,0,0,.05);border-color:rgba(0,0,0,.1)}
      .yat-gs-result-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
      .yat-gs-result-name{font:700 16px "Bebas Neue",sans-serif;letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--fg);line-height:1.15}
      .yat-gs-result-loc{font:300 10px Oswald,sans-serif;letter-spacing:.06em;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase}
      .yat-gs-player .yat-gs-result-crest{width:40px;height:40px}
      .yat-gs-player .yat-gs-result-top{padding-right:12px}
      .yat-gs-status{font:700 8px Oswald,sans-serif;letter-spacing:.12em;text-transform:uppercase;padding:4px 9px;border-radius:5px;white-space:nowrap;flex-shrink:0;display:inline-block;line-height:1.5;align-self:flex-start}
      .yat-gs-status-live{background:rgba(0,230,118,.14);border:1px solid rgba(0,230,118,.6);color:#00e676}
      .yat-gs-status-potential{background:rgba(255,193,7,.12);border:1px solid rgba(255,193,7,.5);color:#ffc107}
      .yat-gs-status-inactive{background:rgba(158,158,158,.07);border:1px solid rgba(158,158,158,.25);color:#888}
      .yat-gs-stats{display:flex;flex-wrap:nowrap;gap:0;border-top:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.25);overflow-x:auto;-webkit-overflow-scrolling:touch}
      body.light-theme .yat-gs-stats{border-top-color:rgba(0,0,0,.08);background:rgba(0,0,0,.04)}
      .yat-gs-chip{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 12px;min-width:52px;flex:1;border-right:1px solid rgba(255,255,255,.06);position:relative}
      .yat-gs-chip:last-child{border-right:none}
      body.light-theme .yat-gs-chip{border-right-color:rgba(0,0,0,.07)}
      .yat-gs-chip-val{font:700 16px "Bebas Neue",sans-serif;letter-spacing:.04em;color:var(--fg);line-height:1;white-space:nowrap}
      .yat-gs-chip-val.hi{color:#00e676}
      .yat-gs-chip-lbl{font:300 8px Oswald,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);line-height:1;white-space:nowrap}
      .yat-gs-msg{padding:28px 12px;text-align:center;font:300 13px Oswald,sans-serif;color:var(--muted)}
      .yat-gs-coming{font:300 9px/1 Oswald,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:center;padding:8px 0 4px;border-top:1px solid var(--line);opacity:.5}

      /* ── News Section ─────────────────────────────────────────────── */
      .yat-news-wrap{max-width:1400px;margin:0 auto;padding:16px 20px}
      .yat-news-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px}
      .yat-news-title{font:700 clamp(20px,2.8vw,28px)/1 "Bebas Neue",Oswald,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--fg)}
      .yat-news-sub{font:300 14px/1.6 Oswald,sans-serif;color:var(--muted);letter-spacing:.03em;margin-top:4px}
      .yat-news-filters{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 0 16px;border-bottom:1px solid var(--line);margin-bottom:18px}
      .yat-news-filter-input{flex:1;min-width:200px;max-width:280px;background:transparent;border:1px solid var(--line);border-radius:8px;padding:8px 14px;font:300 14px Oswald,sans-serif;color:var(--fg);letter-spacing:.03em;outline:none}
      .yat-news-filter-input:focus{border-color:rgba(255,255,255,.3)}
      body.light-theme .yat-news-filter-input:focus{border-color:rgba(0,0,0,.3)}
      .yat-news-filter-input::placeholder{color:var(--muted);opacity:.7}
      .yat-news-filter-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
      .yat-news-chip{font:700 11px Oswald,sans-serif;letter-spacing:.07em;text-transform:uppercase;padding:6px 12px;border-radius:20px;background:transparent;border:1px solid var(--line);color:var(--muted);cursor:pointer;transition:background .15s,color .15s,border-color .15s}
      .yat-news-chip:hover,.yat-news-chip.active{background:var(--fg);color:var(--bg);border-color:var(--fg)}
      .yat-news-filter-reset{font:700 11px Oswald,sans-serif;letter-spacing:.07em;text-transform:uppercase;padding:6px 14px;border-radius:20px;background:transparent;border:1px solid var(--line);color:var(--muted);cursor:pointer;transition:opacity .15s}
      .yat-news-filter-reset:hover{opacity:.7}
      .yat-news-filter-label{font:300 11px Oswald,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
      .yat-news-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:20px}
      @media(max-width:768px){.yat-news-grid{grid-template-columns:1fr;gap:14px}}
      .yat-news-card{display:flex;flex-direction:column;background:var(--card-bg);border:1px solid var(--line);border-radius:12px;overflow:hidden;transition:border-color .2s,transform .15s,box-shadow .2s;cursor:pointer}
      .yat-news-card:hover{border-color:rgba(255,255,255,.22);transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,.4)}
      body.light-theme .yat-news-card:hover{border-color:rgba(0,0,0,.18);box-shadow:0 8px 24px rgba(0,0,0,.12)}
      .yat-news-img-wrap{position:relative;width:100%;padding-bottom:52%;overflow:hidden;background:#0a0a0a;flex-shrink:0}
      .yat-news-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .3s}
      .yat-news-card:hover .yat-news-img{transform:scale(1.03)}
      .yat-news-img-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:40px;opacity:.12;background:var(--card-bg)}
      .yat-news-sentiment{position:absolute;top:8px;right:8px;font:700 10px Oswald,sans-serif;letter-spacing:.1em;text-transform:uppercase;padding:4px 8px;border-radius:5px;line-height:1.4}
      .yat-news-sentiment-positive{background:rgba(0,230,118,.18);border:1px solid rgba(0,230,118,.5);color:#00e676}
      .yat-news-sentiment-negative{background:rgba(244,67,54,.18);border:1px solid rgba(244,67,54,.5);color:#f44336}
      .yat-news-sentiment-neutral{background:rgba(158,158,158,.12);border:1px solid rgba(158,158,158,.3);color:#9e9e9e}
      .yat-news-body{padding:18px;display:flex;flex-direction:column;gap:10px;flex:1}
      .yat-news-player-row{display:flex;align-items:center;gap:7px;margin-bottom:0}
      .yat-news-player-name{font:700 12px Oswald,sans-serif;letter-spacing:.07em;text-transform:uppercase;color:var(--green)}
      .yat-news-level-chip{font:700 10px Oswald,sans-serif;letter-spacing:.07em;text-transform:uppercase;padding:2px 7px;border-radius:4px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:var(--muted)}
      body.light-theme .yat-news-level-chip{background:rgba(0,0,0,.06);border-color:rgba(0,0,0,.12)}
      .yat-news-card-title{font:700 clamp(16px,2vw,20px)/1.25 "Bebas Neue",sans-serif;letter-spacing:.03em;color:var(--fg);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      .yat-news-snippet{font:300 14px/1.65 Oswald,sans-serif;color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      .yat-news-snippet em{color:var(--fg);font-style:normal;font-weight:500}
      .yat-news-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:12px;border-top:1px solid var(--line)}
      .yat-news-source{font:500 12px Oswald,sans-serif;letter-spacing:.06em;color:var(--muted);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .yat-news-date{font:300 12px Oswald,sans-serif;color:var(--muted);white-space:nowrap}
      .yat-news-categories{display:flex;flex-wrap:wrap;gap:4px}
      .yat-news-cat{font:700 9px Oswald,sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:2px 7px;border-radius:4px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:var(--muted)}
      body.light-theme .yat-news-cat{background:rgba(0,0,0,.05);border-color:rgba(0,0,0,.1)}
      .yat-news-loading{grid-column:1/-1;text-align:center;padding:60px 0}
      .yat-news-empty-icon{font-size:36px;opacity:.2;margin-bottom:12px}
      .yat-news-loading-spinner{display:inline-block;width:32px;height:32px;border:3px solid var(--line);border-top-color:var(--green);border-radius:50%;animation:yat-spin 0.8s linear infinite}
      @keyframes yat-spin{to{transform:rotate(360deg)}}
      .yat-news-loading-text{font:300 13px Oswald,sans-serif;color:var(--muted);margin-top:12px;letter-spacing:.06em}
      .yat-news-error{grid-column:1/-1;text-align:center;padding:40px 16px}
      .yat-news-error-icon{font-size:32px;margin-bottom:8px;opacity:.3}
      .yat-news-error-text{font:300 13px/1.5 Oswald,sans-serif;color:var(--muted)}
      .yat-news-footer{text-align:center;margin-top:16px;padding:12px 0}
      .yat-news-powered{font:300 9px Oswald,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);opacity:.5}

      .yat-article-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;opacity:0;pointer-events:none;transition:opacity .25s}
      .yat-article-overlay.open{opacity:1;pointer-events:auto}
      .yat-article-modal{position:fixed;top:0;right:0;bottom:0;width:min(640px,100%);background:var(--bg);overflow-y:auto;z-index:201;transform:translateX(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column}
      body.light-theme .yat-article-modal{border-left:1px solid var(--line)}
      .yat-article-modal.open{transform:translateX(0)}
      .yat-article-modal-top{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line);flex-shrink:0}
      .yat-article-modal-label{font:700 11px Oswald,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
      .yat-article-modal-close{background:none;border:none;color:var(--fg);cursor:pointer;padding:4px;display:inline-flex;align-items:center}
      .yat-article-modal-close i{font-size:22px}
      .yat-article-modal-img{width:100%;aspect-ratio:16/8;object-fit:cover;display:block;flex-shrink:0}
      .yat-article-modal-img-ph{width:100%;aspect-ratio:16/8;background:var(--card-bg);display:flex;align-items:center;justify-content:center;font-size:48px;opacity:.1;flex-shrink:0}
      .yat-article-modal-body{padding:20px 20px 32px;display:flex;flex-direction:column;gap:14px;flex:1}
      .yat-article-modal-player{display:flex;align-items:center;gap:8px}
      .yat-article-modal-player-name{font:700 13px Oswald,sans-serif;letter-spacing:.07em;text-transform:uppercase;color:var(--green)}
      .yat-article-modal-level{font:700 10px Oswald,sans-serif;letter-spacing:.07em;text-transform:uppercase;padding:2px 7px;border-radius:4px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:var(--muted)}
      body.light-theme .yat-article-modal-level{background:rgba(0,0,0,.06);border-color:rgba(0,0,0,.12)}
      .yat-article-modal-title{font:700 clamp(18px,3vw,26px)/1.2 "Bebas Neue",sans-serif;letter-spacing:.04em;color:var(--fg)}
      .yat-article-modal-snippet{font:300 15px/1.65 Oswald,sans-serif;color:var(--muted)}
      .yat-article-modal-snippet em{color:var(--fg);font-style:normal;font-weight:500}
      .yat-article-modal-meta{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
      .yat-article-modal-source{font:400 12px Oswald,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
      .yat-article-modal-date{font:300 12px Oswald,sans-serif;color:var(--muted)}
      .yat-article-modal-actions{display:flex;flex-direction:column;gap:10px;margin-top:4px}
      .yat-article-modal-read{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 20px;background:var(--green);color:#000;font:700 13px Oswald,sans-serif;letter-spacing:.08em;text-transform:uppercase;border-radius:8px;text-decoration:none;transition:opacity .15s}
      .yat-article-modal-read:hover{opacity:.85}
      .yat-article-modal-read i{font-size:16px}
      .yat-share-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .yat-share-label{font:300 10px Oswald,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-right:4px}
      .yat-share-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:20px;border:1px solid var(--line);background:transparent;color:var(--muted);font:700 10px Oswald,sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;transition:background .15s,color .15s,border-color .15s;white-space:nowrap}
      .yat-share-btn:hover{border-color:rgba(255,255,255,.3);color:var(--fg);background:rgba(255,255,255,.06)}
      body.light-theme .yat-share-btn:hover{border-color:rgba(0,0,0,.25);background:rgba(0,0,0,.04)}
      .yat-share-btn i{font-size:14px}
      .yat-share-btn.copied{color:var(--green);border-color:var(--green)}
    `}</style>
  );
}
