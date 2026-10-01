'use client';

import React, { useMemo, useState } from 'react';
import FantasyGameSocial from './FantasyGameSocial';
import { createPortal } from 'react-dom';
import { abbr, fmtRange, place, type GameRow, type Index } from './gallery';
import { runsThrough, type WeekCard } from './schoolSeason';
import type { FantasyStageKey } from './bracketNav';

type Open = { card: WeekCard; side: 'h' | 'a' };
type Cal = { week: number; final: number; days: number };
type FanRow = { name: string; meta: string };

const FIRST = ['Alex','Jordan','Taylor','Morgan','Casey','Drew','Cameron','Reese','Parker','Riley','Quinn','Avery','Logan','Emerson','Skyler','Hayden','Blake','Jamie','Bailey','Reagan','Charlie','Dakota','Sydney','Kendall'];
const LAST = ['Reed','Martinez','Collins','Bennett','Foster','Ramirez','Murphy','Brooks','Price','Kelly','Cooper','Richardson','Ward','Peterson','Gray','Morgan','Bailey','Howard','Cox','Bell','Rivera','Wood','James','Watson'];

function shortName(name: string) {
  return name.split(' (')[0];
}
function fanName(seed: number, i: number) {
  return `${FIRST[Math.abs(seed * 31 + i * 17) % FIRST.length]} ${LAST[Math.abs(seed * 13 + i * 29 + 7) % LAST.length]}`;
}
function raffleRows(index: Index): FanRow[] {
  const seed = index.champion || 1;
  return Array.from({ length: 36 }, (_, i) => {
    const registeredRounds = 1 + Math.abs((seed + i * 7) % 10);
    const superFan = i % 3 === 0;
    const regular = registeredRounds;
    const bonus = superFan ? registeredRounds : 0;
    const entries = regular + bonus + 1;
    return {
      name: fanName(seed, i),
      meta: `${superFan ? 'Super Fan' : 'Fan'} · ${entries} entries`,
    };
  });
}
function topFanRows(index: Index): FanRow[] {
  return index.lbLeaders.map((h, i) => ({
    name: fanName(h, i + 60),
    meta: `${shortName(index.schools[h]?.[0] || '')} · nominated Top Fan`,
  }));
}
function cardFor(g: GameRow, stage: string, file: string, cal: Cal): WeekCard {
  const w = g[1];
  const state = w <= cal.final ? 'final' : w === cal.week ? 'live' : 'next';
  return { week:w, stage, state, game:g, file, days:w <= cal.final ? 7 : w === cal.week ? cal.days : 0 };
}
function InfoDrawer({ title, kicker, rows, note, onClose }:{
  title:string; kicker:string; rows:FanRow[]; note?:string; onClose:()=>void;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="yfp-post-mask" onClick={onClose}>
      <aside className="yfp-post-drawer" role="dialog" aria-modal="true" aria-label={title} onClick={(e)=>e.stopPropagation()}>
        <div className="yfp-post-drawer-head">
          <div><b>{title}</b><span>{kicker}</span></div>
          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="yfp-post-drawer-scroll">
          <ol>
            {rows.map((row,i)=><li key={`${row.name}-${i}`}><b>{row.name}</b><span>{row.meta}</span></li>)}
          </ol>
        </div>
        {note ? <p className="yfp-post-drawer-note">{note}</p> : null}
      </aside>
    </div>,
    document.body
  );
}

function InfoCard({ kicker, title, body, rows, onOpen }:{
  kicker:string; title:string; body:string; rows?:FanRow[]; onOpen?:()=>void;
}) {
  return (
    <article className="yfp-card yfp-post-card">
      <div className="yfp-post-kicker">{kicker}</div>
      <div className="yfp-post-title">{title}</div>
      <p>{body}</p>
      {rows?.length ? <div className="yfp-post-preview">
        {rows.slice(0,8).map((row,i)=><div key={`${row.name}-${i}`}><b>{row.name}</b><span>{row.meta}</span></div>)}
      </div> : null}
      {onOpen ? <button type="button" className="yfp-post-open" onClick={onOpen}>View full list</button> : null}
    </article>
  );
}

export default function PostseasonStage({ stage, index, me, cal, rec, onOpen }:{
  stage: FantasyStageKey;
  index: Index;
  me: number;
  cal: Cal;
  rec: (h:number, week:number)=>string;
  onOpen: (o:Open)=>void;
}) {
  const [drawer, setDrawer] = useState<null | {title:string;kicker:string;rows:FanRow[];note?:string}>(null);
  const bracketFans = useMemo(()=>raffleRows(index),[index]);
  const topFans = useMemo(()=>topFanRows(index),[index]);
  const championName = shortName(index.schools[index.champion]?.[0] || 'Bracket Champion');

  const games = (week:number) => index.lbt.filter((x)=>x.game[1]===week).map((x)=>x.game);
  const gameCard = (g:GameRow, label:string, file:string) => {
    const card = cardFor(g,label,file,cal);
    const [hr, ar] = runsThrough(g, card.days);
    const gameNo = g[1] === 31 ? games(31).findIndex((x)=>x[0]===g[0]) + 1
      : g[1] === 32 ? games(32).findIndex((x)=>x[0]===g[0]) + 1 : 1;
    const row = (side:'a'|'h') => {
      const h = side === 'h' ? g[2] : g[3];
      const off = side === 'h' ? 0 : 1;
      const won = card.state === 'final' && g[6] === h;
      const rawName = index.schools[h]?.[0] || '';
      const name = shortName(rawName);
      const location = place(rawName);
      return <div className={`yfp-post-green-row${h===me?' me':''}${won?' won':''}`}>
        <button type="button" className="yfp-post-green-team" onClick={()=>onOpen({card,side})}>
          <span className="abbr">{abbr(name)}</span><span className="full">{name}</span>
          {location ? <span className="place">{location}</span> : null}
        </button>
        {[0,1,2,3,4,5,6,7,8].map((i)=>{
          const shown = card.state === 'final' || (card.state === 'live' && i < card.days);
          return <span key={i} className={shown && g[5][i*2+off] ? 'scored' : ''}>{shown ? g[5][i*2+off] : ''}</span>;
        })}
        <strong>{card.state==='final'||card.state==='live' ? (side==='h'?hr:ar) : ''}</strong>
      </div>;
    };
    const scoreboard = <>
      <div className="yfp-post-game-head"><span>Week {g[1]}</span><span>{label}{g[1] < 33 ? ` · Game ${gameNo}` : ''}</span></div>
      <div className="yfp-post-green-board">
        <div className="yfp-post-green-row head"><span>{card.state==='final'?'FINAL':card.state==='live'?'LIVE':'UPCOMING'}</span>{[1,2,3,4,5,6,7,8,9].map((n)=><span key={n}>{n}</span>)}<strong>R</strong></div>
        {row('a')}{row('h')}
      </div>
      <div className="yfp-post-game-date">{index.weeks[g[1]-1] ? fmtRange(index.weeks[g[1]-1][0],index.weeks[g[1]-1][1]) : ''}</div>
    </>;
    const awayName = shortName(index.schools[g[3]]?.[0] || '');
    const homeName = shortName(index.schools[g[2]]?.[0] || '');
    return <article key={g[0]} className="yfp-card yfp-post-game" id={`postgame-${g[0]}`}>
      {scoreboard}
      {(card.state==='final'||card.state==='live') ? <FantasyGameSocial
        gameKey={`sim-2026:${g[0]}`}
        title={label}
        subtitle={`${awayName} ${ar} · ${homeName} ${hr}`}
        shareText={`Follow the YAT?STATS High School Alumni Fantasy Game between ${awayName} and ${homeName}.`}
        shareUrl={typeof window==='undefined'?'':`${window.location.origin}${window.location.pathname}?fantasyGame=${g[0]}&week=${g[1]}#sec-fantasy`}
        preview={<div className="yfp-post-game">{scoreboard}</div>}
      /> : null}
    </article>;
  };

  let cards: React.ReactNode;
  if(stage==='c1'){
    cards = games(31).map((g,i)=>gameCard(g,`Season Championship Round 1 · Game ${i+1}`,'d-lbt'));
  } else if(stage==='c2'){
    cards = <>
      {games(32).map((g,i)=>gameCard(g,`Season Championship Round 2 · Game ${i+1}`,'d-lbt'))}
      <InfoCard kicker="BRACKET CHAMPION · BYE" title={championName}
        body="The 10-round Bracket Champion is waiting for the winner of the eight-team single-elimination Season Championship Tournament." />
    </>;
  } else if(stage==='cg'){
    const g=games(33)[0];
    cards = <>
      {g ? gameCard(g,'Season Championship Game','d-lbt') : null}
      <InfoCard kicker="BRACKET CHAMPION · BYE" title={championName}
        body="Waiting for the winner of this Championship Game. The winner advances to the YAT?STATS World Series." />
      <InfoCard kicker="WORLD SERIES TICKETS RAFFLE" title="Bracket Champion fans"
        body="Registered fans of the Bracket Champion whose names will be entered in the World Series tickets raffle."
        rows={bracketFans}
        onOpen={()=>setDrawer({title:'World Series raffle entries',kicker:`${championName} registered fans`,rows:bracketFans})} />
    </>;
  } else {
    const g=index.gf.find((x)=>x[1]===34) || index.gf[0];
    cards = <>
      {g ? gameCard(g,'YAT?STATS World Series','d-gf') : null}
      <InfoCard kicker="REGIONAL TOP FANS" title="8 nominated Top Fans"
        body="One fan nominated by the players from each of the eight regional Season Championship teams."
        rows={topFans}
        onOpen={()=>setDrawer({title:'Regional Top Fans',kicker:'8 Season Championship teams',rows:topFans})} />
      <InfoCard kicker="WORLD SERIES TICKETS RAFFLE" title="Bracket Champion fans"
        body="The Bracket Champion fan list stays visible through the final World Series week."
        rows={bracketFans}
        onOpen={()=>setDrawer({title:'World Series raffle entries',kicker:`${championName} registered fans`,rows:bracketFans,note:'All entries must be submitted by 11:59 PM September 26, 2027.'})} />
    </>;
  }

  return <>
    <div className={`yfz-cards yfp-postseason-cards ${stage}`}>{cards}</div>
    {drawer ? <InfoDrawer {...drawer} onClose={()=>setDrawer(null)} /> : null}
    <style jsx global>{`
      .yfp-postseason-cards{align-items:stretch}
      .yfp-post-game{padding:0;overflow:hidden;min-height:190px}
      .yfp-post-game-head{display:flex;justify-content:space-between;gap:6px;padding:5px 7px 4px;background:#9c7f22;color:#fff5cf;font:700 8px/1 var(--yfp-sb),"Arial Narrow",Oswald,sans-serif;letter-spacing:.04em;text-transform:uppercase}
      .yfp-post-green-board{padding:6px;background:linear-gradient(180deg,#1f6546,#174c35);border-bottom:1px solid #0d3022}
      .yfp-post-green-row{display:grid;grid-template-columns:minmax(82px,1fr) repeat(9,18px) 28px;gap:2px;align-items:center;margin-top:2px}
      .yfp-post-green-row.head{margin-top:0;color:#eef7ef;font:700 8px/1 Oswald,sans-serif;text-align:center}.yfp-post-green-row.head>span:not(:first-child){display:grid;place-items:center}
      .yfp-post-green-team{min-width:0;border:0;background:transparent;color:#fff;text-align:left;padding:0 5px 0 0;cursor:pointer}.yfp-post-green-team .abbr{display:none}.yfp-post-green-team .full{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:800 10px/.95 "Roboto Condensed","Arial Narrow",Oswald,sans-serif;letter-spacing:-.025em}.yfp-post-green-team .place{display:block;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#a8bbb0;font:600 5.8px/1 Oswald,sans-serif;letter-spacing:.03em;text-transform:uppercase}.yfp-post-green-row.me .yfp-post-green-team{color:#ffd34f}
      .yfp-post-green-row>span:not(:first-child),.yfp-post-green-row>strong{height:20px;display:grid;place-items:center;border-radius:3px;background:#0d2d20;color:#edf4ee;font:800 11px/1 Oswald,sans-serif}.yfp-post-green-row>strong{color:#ffd34f;font-size:13px}.yfp-post-green-row.won>strong{background:#f3c735;color:#15251d}
      .yfp-post-game-date{padding:7px;color:var(--yfp-muted);font:600 9px/1 Oswald,sans-serif;text-transform:uppercase;letter-spacing:.06em}
      .yfp-post-card{min-height:230px;display:flex;flex-direction:column;overflow:hidden;border-color:rgba(255,210,74,.28);background:linear-gradient(180deg,rgba(255,210,74,.075),rgba(255,255,255,.025))}
      .yfp-post-kicker{color:var(--yfp-gold);font:800 9px/1 Oswald,sans-serif;letter-spacing:.11em;text-transform:uppercase;margin-bottom:7px}
      .yfp-post-title{color:var(--yfp-strong);font:700 22px/.95 "Bebas Neue",Oswald,sans-serif;letter-spacing:.025em;text-transform:uppercase}
      .yfp-post-card>p{margin:8px 0;color:var(--yfp-muted);font:500 11px/1.35 var(--yfp-sb),"Arial Narrow",Oswald,sans-serif}
      .yfp-post-preview{flex:1;min-height:0;max-height:125px;overflow-y:auto;overscroll-behavior:contain;border-top:1px solid var(--yfp-card-border);margin-top:4px;padding-top:4px;scrollbar-width:thin}
      .yfp-post-preview>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;padding:3px 1px;border-bottom:1px solid var(--yfp-card-border);font:500 9px/1.2 var(--yfp-sb),"Arial Narrow",Oswald,sans-serif}
      .yfp-post-preview b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--yfp-strong);font-weight:700}
      .yfp-post-preview span{color:var(--yfp-muted);text-align:right}
      .yfp-post-open{margin-top:7px;width:100%;min-height:30px;border:1px solid var(--yfp-gold);background:rgba(255,210,74,.08);color:var(--yfp-gold);font:800 9px/1 Oswald,sans-serif;letter-spacing:.09em;text-transform:uppercase;cursor:pointer}

      .yfp-post-mask{position:fixed;inset:0;z-index:2147483300;background:rgba(0,0,0,.5)}
      .yfp-post-drawer{position:absolute;top:0;bottom:0;right:0;width:min(520px,94vw);display:flex;flex-direction:column;overflow:hidden;background:#141820;color:#e9ecf1;box-shadow:0 0 30px rgba(0,0,0,.45)}
      .yfp-post-drawer-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #262c37}
      .yfp-post-drawer-head>div{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.yfp-post-drawer-head b{color:#ffd24a;font:700 18px/1 Oswald,sans-serif}.yfp-post-drawer-head span{color:#8b93a1;font:600 10px/1.2 Oswald,sans-serif;text-transform:uppercase;letter-spacing:.08em}
      .yfp-post-drawer-head button{width:34px;height:34px;border:1px solid #363d49;border-radius:50%;background:transparent;color:#fff;cursor:pointer}
      .yfp-post-drawer-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:8px 14px;scrollbar-width:thin}
      .yfp-post-drawer-scroll ol{list-style:none;margin:0;padding:0}.yfp-post-drawer-scroll li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:8px 2px;border-bottom:1px solid #262c37}.yfp-post-drawer-scroll li b{font:700 13px/1.2 Oswald,sans-serif}.yfp-post-drawer-scroll li span{color:#8b93a1;font:500 10px/1.2 Oswald,sans-serif;text-align:right}
      .yfp-post-drawer-note{margin:0;padding:9px 14px 12px;border-top:1px solid #262c37;color:#8b93a1;font:500 10px/1.35 Oswald,sans-serif}
      @media(max-width:899px){.yfp-post-green-row{grid-template-columns:68px repeat(9,minmax(10px,1fr)) 24px;gap:1px}.yfp-post-green-team .full{display:block;font-size:7.5px;letter-spacing:-.035em}.yfp-post-green-team .place{font-size:4.8px;letter-spacing:.02em}.yfp-post-green-team .abbr{display:none}.yfp-raffle-cta{grid-template-columns:1fr;gap:7px}.yfp-raffle-cta button{width:100%}.yfp-post-card{min-height:220px}}
    `}</style>
  </>;
}
