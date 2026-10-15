'use client';

import { useContext, useState } from 'react';
import { SchoolContext } from '@/context/SchoolContext';
import { openConnectInquiry, type SponsorInterest } from '@/lib/contribute';

type PackageId = 'title' | 'active' | 'retired' | 'bracket' | 'team';
type Package = {
  id:PackageId; name:string; location:string; intro:string; inventory:string[];
  desktop:string; mobile:string; metrics:string; inquiry:SponsorInterest;
};
const PACKAGES:Package[] = [
 {id:'title',name:'Title Sponsor',location:'SCHOOL-WIDE RECOGNITION',intro:'One hometown sponsor across the school experience, three galleries, news, and school-to-fan communications.',
  inventory:['Splash page: title recognition','Active Quick Flip Gallery: sponsor flip card, front and back','All-Time Quick Flip Gallery: same sponsor flip card, front and back','Current Team Flip Gallery: same sponsor flip card, front and back','Active Alumni News: desktop tower / horizontal row on mobile','Favorite-player updates, announcements and eligible school-to-fan communications: title recognition'],desktop:'Splash + 3 gallery flip-card placements + news tower + correspondence',mobile:'Splash + gallery cards + news ad row + correspondence',metrics:'School unique audience, gallery card views/flips, news viewability, delivered alerts and qualified responses',inquiry:'title'},
 {id:'active',name:'Player Profile Partner — Active',location:'ACTIVE PLAYER FUNZONE',intro:'Sponsor an active alumnus in the News, Connect and Stories tabs of their existing player profile.',
  inventory:['Player-profile News tab: right-side advertising tower','Player-profile Connect tab: right-side advertising tower','Player-profile Stories / Career Path tab: right-side advertising tower','The same placements become a horizontal advertising row on mobile'],desktop:'Three FunZone tabs: right tower',mobile:'Three FunZone tabs: stacked ad row',metrics:'Profile sessions, News/Connect/Stories views, viewable impressions, clicks and qualified responses',inquiry:'profile'},
 {id:'retired',name:'Player Profile Partner — Retired',location:'ALL-TIME / RETIRED PLAYER FUNZONE',intro:'The same profile placement package with a proposed discount for former Next-Level alumni.',
  inventory:['Archived career News tab: partner tower','Video Connect tab: partner tower','Career Path Stories tab: partner tower','Mobile: the tower converts into a horizontal advertising row','Discount relative to the active profile package; no price set'],desktop:'Three FunZone tabs: right tower',mobile:'Three FunZone tabs: stacked ad row',metrics:'Retired-profile sessions, archived-news views, viewability, clicks and qualified responses',inquiry:'profile'},
 {id:'bracket',name:'Fantasy Bracket Partner',location:'ALUMNI FANTASY SCOREBOARD',intro:'Brand exposure beside the scoreboard when both statistical side panels are closed; the same space is unavailable while panels are open.',
  inventory:['Scoreboard-adjacent sponsor area when statistical drawers are closed','No counted sponsor impression when stat panels cover the placement','Mobile ad placement to be verified before sale'],desktop:'Beside right-anchored scoreboard when stat panels closed',mobile:'Placement subject to responsive testing',metrics:'Tournament audience, time panels are closed, in-view ad impressions and clicks',inquiry:'bracket'},
 {id:'team',name:'All-Time Sponsor a Team',location:'ALL-TIME NEXT-LEVEL LIST',intro:'ONE combined sponsorship: the team-year logo banner plus the matching Row 5 YaTi offer message on the same page.',
  inventory:['All-Time team-year banner: sponsor logo and branding','Row 5 YaTi callout: same partner\'s offers, specials and CTA','Both placements included together; not separately priced'],desktop:'Existing All-Time banner and Row 5 YaTi offer',mobile:'Same two placements, adapted to existing layout',metrics:'Team-year views, banner impressions, Row 5 offer exposure, clicks and qualified leads',inquiry:'title'}
];

function AdUnit({name,mode}:{name:string;mode:'tower'|'row'}) {
  return <div className={'yp-partner-ad yp-partner-'+mode} aria-label={name+' proposed sponsor placement'}>
    <span>RESERVED PARTNER INVENTORY</span><strong>{name}</strong><small>{mode==='tower'?'DESKTOP TOWER':'MOBILE AD ROW'} · SPONSOR CREATIVE GOES HERE</small>
  </div>;
}
function Placement({item}:{item:Package}) {
  if(item.id==='title')return <div className="yp-partner-placements">
    <div className="yp-partner-placement"><small>SCHOOL SPLASH PAGE</small><div className="yp-partner-block">TITLE SPONSOR LOGO / BRANDING</div></div>
    <div className="yp-partner-placement"><small>EXISTING THREE QUICK FLIP GALLERIES</small>
      <div className="yp-partner-flips"><div>FRONT<br/>TITLE SPONSOR CARD</div><div>BACK<br/>SPONSOR MESSAGE</div></div>
      <p>One branded front/back flip card in Active, All-Time and Current Team galleries. No gallery rearrangement.</p></div>
    <div className="yp-partner-placement"><small>ACTIVE ALUMNI NEWS</small><AdUnit name="TITLE SPONSOR · NEWS" mode="row"/></div>
    <div className="yp-partner-placement"><small>SCHOOL → FAN CORRESPONDENCE</small><div className="yp-partner-block">PRESENTED BY [TITLE SPONSOR] · EMAIL / SMS</div></div>
  </div>;
  if(item.id==='active'||item.id==='retired')return <div className="yp-partner-placement">
    <small>REAL PLAYER PROFILE: NEWS · CONNECT · STORIES</small>
    <div className="yp-partner-profile-sample"><div className="yp-partner-profile-copy"><div>NEWS &nbsp; | &nbsp; CONNECT &nbsp; | &nbsp; STORIES</div><span>Existing player content / real news rows / video / timeline</span><span>Profile statistics and player information stay unchanged</span></div><AdUnit name="PROFILE PARTNER" mode="tower"/></div>
    <AdUnit name="PROFILE PARTNER" mode="row"/><p>The actual profile page has this ad slot on the right of each tab; on mobile the same advertiser shifts to a horizontal row.</p>
  </div>;
  if(item.id==='bracket')return <div className="yp-partner-placement">
    <small>FANTASY BRACKET: STAT PANELS CLOSED</small><div className="yp-partner-bracket"><AdUnit name="BRACKET PARTNER" mode="tower"/><div>RIGHT-ANCHORED<br/>MAIN SCOREBOARD</div></div>
    <p>When team-stat panels open on the left, the ad space is not visible. These are reserved locations, not functional bracket changes.</p>
  </div>;
  return <div className="yp-partner-placement">
    <small>EXISTING ALL-TIME LIST · NO GALLERY REDESIGN</small>
    <div className="yp-partner-block">ROW 3 · SPONSOR A TEAM LOGO / BANNER</div>
    <div className="yp-partner-block">ROW 5 · YaTi MESSAGE / PARTNER OFFER</div>
    <p>Two placements together in one package. Existing All-Time layout remains as it is.</p>
  </div>;
}
export default function PartnerProgramPage(){
 const school=useContext(SchoolContext);
 const [selected,setSelected]=useState<PackageId>('title');
 const item=PACKAGES.find(p=>p.id===selected)||PACKAGES[0];
 const [showAll,setShowAll]=useState(false);
 return <div className="yp-partner" id="yp-real-partner-program">
   <header className="yp-partner-header"><div><span>YAT?STATS · {school?.hsName||'HOMETOWN BASEBALL'}</span>
      <h1>PARTNERSHIP PROGRAM</h1><p>Stories and Stats! <strong>Connect. Contribute. Reminisce.</strong></p></div>
      <div className="yp-partner-header-right">5 PARTNER PACKAGES<br/><strong>RATES NOT YET ASSIGNED</strong></div></header>
   <div className="yp-partner-columns">
     <div className="yp-partner-left">
       <div className="yp-partner-tabs-title">CHOOSE A PARTNERSHIP PACKAGE</div>
       {PACKAGES.map((p,i)=><button key={p.id} type="button" className={'yp-partner-package'+(selected===p.id?' is-active':'')}
         onClick={()=>{setSelected(p.id);setShowAll(false);}} aria-pressed={selected===p.id}>
         <span className="yp-partner-num">{String(i+1).padStart(2,'0')}</span>
         <span className="yp-partner-package-copy"><small>{p.location}</small><strong>{p.name}</strong><span>{p.intro}</span><b>VIEW LOCATIONS →</b></span><span className="yp-partner-rate">RATE<br/>—</span>
       </button>)}
       <p className="yp-partner-aside">Each package has its own locations. Ad artwork and rates are intentionally blank. No inventory has been sold.</p>
     </div>
     <aside className="yp-partner-right">
       <header><small>PACKAGE {PACKAGES.indexOf(item)+1} · WHERE PARTNERS APPEAR</small><h2>{item.name}</h2><p>{item.intro}</p></header>
       <Placement item={item}/>
       <div className="yp-partner-deliverables"><h3>INCLUDED PLACEMENTS</h3>
         <ul>{item.inventory.map((s,i)=><li key={i}>{s}</li>)}</ul></div>
       <button type="button" className="yp-partner-primary" onClick={()=>openConnectInquiry(item.inquiry)}>ASK ABOUT THIS PACKAGE →</button>
     </aside>
   </div>
   <section className="yp-partner-rate-card"><div className="yp-partner-rate-heading"><h2>PARTNERSHIP RATE CARD</h2><p>Rates blank pending school-level reach, viewability, engagement, conversion and fulfillment measurements.</p>
      <button type="button" onClick={()=>setShowAll(x=>!x)}>{showAll?'HIDE':'SHOW'} ALL PLACEMENTS</button></div>
     <div className="yp-partner-rate-table-wrap"><table><thead><tr><th>PACKAGE</th><th>DESKTOP LOCATION</th><th>MOBILE LOCATION</th><th>PRICE</th></tr></thead>
       <tbody>{PACKAGES.map(p=><tr key={p.id}><th>{p.name}</th><td>{p.desktop}</td><td>{p.mobile}</td><td className="yp-rate-blank">—</td></tr>)}</tbody></table></div>
     {showAll?<div className="yp-partner-metrics">{PACKAGES.map(p=><article key={p.id}><strong>{p.name}</strong><p>{p.metrics}</p></article>)}</div>:null}
     <p className="yp-partner-pricing-note">Pricing will be based on measured eligible visits, viewable impressions, expected responses, audience relevance and local brand value. Forecasts are not delivery guarantees.</p>
   </section>
   <style jsx global>{`
     .yp-partner{color:var(--fg);background:var(--bg);font:400 13px/1.5 var(--yat-font-ui);width:min(1260px,100%);margin:0 auto;padding:18px 19px 140px}
     .yp-partner *{box-sizing:border-box}
     .yp-partner-header{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:4px 0 20px;border-bottom:1px solid var(--line)}
     .yp-partner-header span,.yp-partner-tabs-title,.yp-partner-right header small,.yp-partner-placement small{font:700 11px var(--yat-font-compact);letter-spacing:.08em;color:var(--muted)}
     .yp-partner-header h1{font:800 clamp(30px,4vw,42px)/1 var(--yat-font-compact);margin:6px 0}
     .yp-partner-header p{color:var(--muted);font-size:12px}.yp-partner-header p strong{color:var(--fg)}
     .yp-partner-header-right{text-align:right;color:var(--muted);font:700 11px/1.4 var(--yat-font-compact)}
     .yp-partner-header-right strong{font-weight:800;color:var(--fg)}
     .yp-partner-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.95fr);gap:22px;align-items:start;padding-top:20px}
     .yp-partner-left,.yp-partner-right{min-width:0}.yp-partner-tabs-title{padding-bottom:12px}
     .yp-partner-package{display:grid;grid-template-columns:27px minmax(0,1fr) 39px;gap:10px;align-items:start;width:100%;padding:14px 9px;margin:0 0 7px;border:1px solid var(--line);border-radius:4px;background:var(--card-bg);color:var(--fg);cursor:pointer;text-align:left}
     .yp-partner-package.is-active{border-color:var(--muted);background:color-mix(in srgb,var(--card-bg) 85%,var(--fg) 15%)}
     .yp-partner-num{font:800 18px var(--yat-font-compact);color:var(--muted)}
     .yp-partner-package-copy{display:flex;flex-direction:column;gap:5px}
     .yp-partner-package-copy small{color:var(--muted);font:700 10px var(--yat-font-compact)}
     .yp-partner-package-copy strong{font:800 19px/1.05 var(--yat-font-compact)}
     .yp-partner-package-copy>span{font:400 12px/1.4 var(--yat-font-ui);color:var(--muted)}
     .yp-partner-package-copy b{font:800 11px var(--yat-font-compact);margin-top:3px}
     .yp-partner-rate{color:var(--muted);text-align:center;font:800 10px/1.1 var(--yat-font-compact)}
     .yp-partner-aside{color:var(--muted);font-size:11px;margin:11px 2px}
     .yp-partner-right{position:sticky;top:calc(var(--row1-h) + var(--row2-h) + var(--row3-h) + 13px);border:1px solid var(--line);border-radius:4px;background:var(--card-bg);padding:17px}
     .yp-partner-right header h2{font:800 25px/1.04 var(--yat-font-compact);margin:5px 0}
     .yp-partner-right header p{color:var(--muted);font:400 12px/1.45 var(--yat-font-ui);margin-bottom:12px}
     .yp-partner-placements{display:grid;grid-template-columns:1fr 1fr;gap:9px}
     .yp-partner-placement{padding:10px;border:1px solid var(--line);border-radius:3px;min-width:0}
     .yp-partner-placement p{font:400 11px/1.4 var(--yat-font-ui);color:var(--muted);margin:7px 0}
     .yp-partner-block{display:grid;place-items:center;min-height:72px;margin-top:9px;padding:10px;background:var(--bg);border:1px dashed var(--muted);text-align:center;font:800 14px/1.12 var(--yat-font-compact)}
     .yp-partner-flips{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:9px}
     .yp-partner-flips div{display:grid;place-items:center;min-height:111px;border:1px dashed var(--muted);border-radius:7px;font:800 14px/1.1 var(--yat-font-compact);text-align:center;padding:6px}
     .yp-partner-ad{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-width:0;padding:15px;text-align:center;border:1px dashed var(--muted);background:var(--bg)}
     .yp-partner-ad span,.yp-partner-ad small{font:700 9px/1.3 var(--yat-font-compact);color:var(--muted)}
     .yp-partner-ad strong{font:800 16px/1.1 var(--yat-font-compact)}
     .yp-partner-tower{min-height:200px}
     .yp-partner-row{min-height:65px;margin-top:9px}
     .yp-partner-profile-sample{display:grid;grid-template-columns:1fr 125px;gap:10px;margin-top:11px;align-items:stretch}
     .yp-partner-profile-copy{display:flex;flex-direction:column;gap:10px;min-height:198px;padding:14px;background:var(--bg);border:1px solid var(--line)}
     .yp-partner-profile-copy div{font:800 11px var(--yat-font-compact)}
     .yp-partner-profile-copy span{font:400 11px/1.4 var(--yat-font-ui);color:var(--muted)}
     .yp-partner-bracket{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:11px}
     .yp-partner-bracket>div:last-child{display:grid;place-items:center;border:1px solid var(--line);text-align:center;font:800 16px var(--yat-font-compact)}
     .yp-partner-deliverables{margin-top:15px;border-top:1px solid var(--line);padding-top:11px}
     .yp-partner-deliverables h3{font:800 17px var(--yat-font-compact)}
     .yp-partner-deliverables ul{padding-left:20px;margin:10px 0}.yp-partner-deliverables li{font:400 11px/1.38 var(--yat-font-ui);margin-bottom:6px}
     .yp-partner-primary{cursor:pointer;display:inline-flex;align-items:center;padding:10px 15px;border:1px solid var(--fg);border-radius:3px;background:var(--fg);color:var(--bg);font:800 12px var(--yat-font-compact)}
     .yp-partner-rate-card{margin-top:25px;border-top:1px solid var(--line);padding-top:21px}
     .yp-partner-rate-heading{display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:10px}
     .yp-partner-rate-heading h2{font:800 25px/1 var(--yat-font-compact)}.yp-partner-rate-heading p{font-size:11px;color:var(--muted)}
     .yp-partner-rate-heading button{background:none;border:1px solid var(--line);color:var(--fg);padding:8px 11px;font:800 11px var(--yat-font-compact);cursor:pointer}
     .yp-partner-rate-table-wrap{max-width:100%;overflow-x:auto;margin-top:13px}
     .yp-partner-rate-card table{min-width:700px;width:100%;border-collapse:collapse;font:400 11px/1.35 var(--yat-font-ui)}
     .yp-partner-rate-card :is(td,th){padding:12px 9px;border:1px solid var(--line);vertical-align:top;text-align:left}
     .yp-partner-rate-card th{font-weight:800}.yp-partner-rate-card thead{background:var(--card-bg)}
     .yp-rate-blank{font:800 18px var(--yat-font-compact);color:var(--muted)}
     .yp-partner-pricing-note{margin-top:13px;font:400 11px/1.5 var(--yat-font-ui);color:var(--muted)}
     .yp-partner-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
     .yp-partner-metrics article{padding:13px;border:1px solid var(--line)}
     .yp-partner-metrics strong{font:800 15px var(--yat-font-compact)}.yp-partner-metrics p{color:var(--muted);font-size:11px}
     @media(max-width:740px){.yp-partner-columns{display:block}.yp-partner-right{position:static;margin-top:14px}.yp-partner{padding:10px 12px 105px}.yp-partner-header{align-items:start}.yp-partner-header-right{display:none}}
     @media(max-width:440px){.yp-partner-placements{grid-template-columns:1fr}.yp-partner-profile-sample{grid-template-columns:1fr 95px}.yp-partner-bracket{grid-template-columns:1fr 1fr}.yp-partner-metrics{grid-template-columns:1fr}}
   `}</style>
 </div>;
}
