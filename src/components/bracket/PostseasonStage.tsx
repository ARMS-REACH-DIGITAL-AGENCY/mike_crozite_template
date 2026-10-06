'use client';

import React, { useEffect, useMemo, useState } from 'react';
import FantasyGameSocial from './FantasyGameSocial';
import { createPortal } from 'react-dom';
import { StatsDot, abbr, fmtRange, loadBoxes, place, shortName, type GameBox, type GameRow, type Index, type PlayerRow } from './gallery';
import { runsThrough, shownDays, type WeekCard } from './schoolSeason';
import type { FantasyStageKey } from './bracketNav';

type Open = { card: WeekCard; side: 'h' | 'a' };
type Cal = { week: number; final: number; days: number };
type FanRow = { name: string; meta: string };

const FIRST = ['Alex','Jordan','Taylor','Morgan','Casey','Drew','Cameron','Reese','Parker','Riley','Quinn','Avery','Logan','Emerson','Skyler','Hayden','Blake','Jamie','Bailey','Reagan','Charlie','Dakota','Sydney','Kendall'];
const LAST = ['Reed','Martinez','Collins','Bennett','Foster','Ramirez','Murphy','Brooks','Price','Kelly','Cooper','Richardson','Ward','Peterson','Gray','Morgan','Bailey','Howard','Cox','Bell','Rivera','Wood','James','Watson'];

function fanName(seed: number, i: number) {
  return `${FIRST[Math.abs(seed * 31 + i * 17) % FIRST.length]} ${LAST[Math.abs(seed * 13 + i * 29 + 7) % LAST.length]}`;
}
function raffleRows(_index: Index): FanRow[] {
  // Real entrant names are intentionally not simulated. This drawer is the
  // destination for the live list once registration data exists.
  return [];
}
function topFanRows(index: Index): FanRow[] {
  // Every Active Alumni from every Regional Champion gets one LuckyFan pick.
  // Do not invent the fan's name; keep the slot visible until the alum selects.
  return index.lbLeaders.flatMap((h) => {
    const school = shortName(index.schools[h]?.[0] || '_______________');
    const alumni = index.alumni?.[String(h)] || [];
    return alumni.map(([alum, level]) => ({
      name: '_______________',
      meta: `${alum} · ${level} · ${school} · LuckyFan selection pending`,
    }));
  });
}
function cardFor(g: GameRow, stage: string, file: string, cal: Cal): WeekCard {
  const w = g[1];
  const state = w <= cal.final ? 'final' : w === cal.week ? 'live' : 'next';
  return { week:w, stage, state, game:g, file, days:w <= cal.final ? 7 : w === cal.week ? cal.days : 0 };
}

function PostGameRecap({ index, game, file }:{ index:Index; game:GameRow; file:string }) {
  const [box, setBox] = useState<GameBox | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadBoxes(file).then((all) => { if (!cancelled) setBox(all[String(game[0])] || null); }).catch(() => {});
    return () => { cancelled = true; };
  }, [file, game]);

  if (!box) return null;
  const candidates = (side:'h'|'a', rows:PlayerRow[]) => rows.map((p) => ({
    p, side,
    school: shortName(index.schools[side === 'h' ? game[2] : game[3]]?.[0] || ''),
  }));
  const all = [...candidates('h', box.h?.p || []), ...candidates('a', box.a?.p || [])];
  const hitters = all.filter((x) => Number.isFinite(Number(x.p[6]))).sort((a,b) => Number(b.p[6]) - Number(a.p[6]));
  const pitchers = all.filter((x) => Number.isFinite(Number(x.p[7]))).sort((a,b) => Number(a.p[7]) - Number(b.p[7]));
  const hitter = hitters[0], pitcher = pitchers[0];
  if (!hitter && !pitcher) return null;

  const parts:string[] = [];
  if (hitter) parts.push(`${hitter.p[1]} led ${hitter.school} with a ${Math.round(Number(hitter.p[6]))} OPS+`);
  if (pitcher) parts.push(`${pitcher.p[1]} paced ${pitcher.school}'s pitching at ${Math.round(Number(pitcher.p[7]))} FIP-`);
  return <div className="yfp-post-recap"><b>GAME RECAP</b><span>{parts.join('. ')}.</span></div>;
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
  kicker:string; title:string; body:React.ReactNode; rows?:FanRow[]; onOpen?:()=>void;
}) {
  return (
    <article className="yfp-card yfp-post-card">
      <div className="yfp-post-kicker">{kicker}</div>
      <div className="yfp-post-title">{title}</div>
      <div className="yfp-post-body">{body}</div>
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
  const bracketChampionKnown = cal.final >= 30;
  const championRaw = bracketChampionKnown ? (index.schools[index.champion]?.[0] || '') : '';
  const championName = championRaw ? shortName(championRaw) : '_______________';
  const championBase = championRaw ? championRaw.split(' (')[0].replace(/\bPreparatory\b/gi,'Prep').trim() : '';
  const championSchool = championBase
    ? (/\b(high|prep|academy|school|college)\b/i.test(championBase) ? championBase : `${championBase} High School`)
    : '_______________';
  const championLocation = championRaw ? place(championRaw) : '_______________';
  const stageKnown = (week:number) => cal.final >= week - 1;
  const qualifiersKnown = cal.final >= 30;
  const waitingCard = (title:string, body:string) => (
    <InfoCard kicker="FIELD NOT SET" title={title} body={body} />
  );
  const week31Announcement = (
    <InfoCard
      kicker="BRACKET CHAMPION · WORLD SERIES TICKETS"
      title={`Bracket Champion: ${championName}`}
      body={<>
        <p>Congratulations to our 30 Week - Ten Round - Undefeated YAT?STATS Alumni Fantasy Bracket Champion, <b>{championName}</b>! Which of these 8 Regional Champions will they play in Week 34&apos;s YAT?STATS WORLD SERIES?</p>
        <p>More importantly, which lucky fan will win 4 tickets to this year&apos;s MLB World Series?</p>
        <p>Congratulations to these fans of <b>{championSchool}</b> from <b>{championLocation}</b>. They have all earned the right to have their name entered (some more than once) into the drawing that will take place on October 3, 2027, the last day of the MLB Regular Season.</p>
        <p className="yfp-madlib-line">_______________</p>
        <p>But don&apos;t fret if your favorite Active Alumni didn&apos;t win the bracket tournament. If you are a current fan of the 8 Regional Champions listed above, you may possibly still have a chance to win. Every Active Alumni from the 8 Regional Winners will each be personally selecting 1 <b>LuckyFan</b> that will have their name added to the pool of potential winners. Good Luck!</p>
      </>}
      onOpen={()=>setDrawer({
        title:'World Series raffle entries',
        kicker:`${championSchool} · ${championLocation}`,
        rows:bracketFans,
        note:'Eligible fan entries will appear here as they are earned and verified.'
      })}
    />
  );
  const blankScoreboard = (week:number, stageHead:string, gameNo?:number) => {
    const slot = gameNo || 1;
    const blankRow = (key:string) => (
      <div className="yfp-green-row" key={key} aria-label="School to be determined">
        <span className="yfp-green-team yfp-green-team-empty" aria-hidden="true" />
        {Array.from({ length: 9 }, (_, i) => <span key={i} className="yfp-green-slot" />)}
        <span className="yfp-green-run" />
        <StatsDot name="TBD" />
      </div>
    );
    const scoreboard = (
      <>
        <div className="yfp-score-head">
          <span>Week {week} | {index.weeks[week-1] ? fmtRange(index.weeks[week-1][0],index.weeks[week-1][1]) : ''}</span>
          <span>{stageHead}{gameNo ? ` | Game ${gameNo}` : ''}</span>
        </div>
        <div className="yfp-green-board" style={{ '--inning-count': 9 } as React.CSSProperties}>
          <div className="yfp-green-row head">
            <span className="yfp-green-status tbd">UPCOMING</span>
            {Array.from({ length: 9 }, (_, i) => i + 1).map((n)=><span key={n}>{n}</span>)}
            <span className="run">R</span>
            <span className="stats">DAILY<br />STATS</span>
          </div>
          {blankRow('away')}
          {blankRow('home')}
        </div>
      </>
    );
    const social = (
      <FantasyGameSocial
        gameKey={`sim-2026:postseason-${week}-${slot}`}
        title={gameNo ? `${stageHead} · Game ${gameNo}` : stageHead}
        subtitle="Matchup to be determined"
        shareText={`Follow the ${stageHead} in the YAT?STATS High School Alumni Fantasy Tournament.`}
        shareUrl={typeof window==='undefined'?'':`${window.location.origin}${window.location.pathname}?week=${week}#sec-fantasy`}
        preview={<div className="yfp-scorecard">{scoreboard}</div>}
      />
    );
    return (
      <article key={`blank-${week}-${slot}`} className="yfp-card yfp-scorecard yfp-post-game tbd">
        <div className="yfp-game-split">
          <div className="yfp-game-scorepane">{scoreboard}</div>
          <div className="yfp-game-socialpane">{social}</div>
        </div>
      </article>
    );
  };

  const games = (week:number) => index.lbt.filter((x)=>x.game[1]===week).map((x)=>x.game);
  const gameCard = (g:GameRow, label:string, file:string) => {
    const card = cardFor(g,label,file,cal);
    const [hr, ar] = runsThrough(g, card.days);
    const gameNo = g[1] === 31 ? games(31).findIndex((x)=>x[0]===g[0]) + 1
      : g[1] === 32 ? games(32).findIndex((x)=>x[0]===g[0]) + 1 : 1;
    const played = card.state === 'final' || card.state === 'live';
    const pill = card.state === 'final' ? 'FINAL' : card.state === 'live' ? 'LIVE' : 'UPCOMING';
    const stageHead = g[1] === 31 ? 'Championship Round 1'
      : g[1] === 32 ? 'Championship Round 2'
      : g[1] === 33 ? 'Championship Game'
      : 'YAT?STATS World Series';

    const inningCount = card.state === 'final' ? Math.max(9, Math.floor(g[5].length / 2)) : 9;
    const row = (side:'a'|'h') => {
      const h = side === 'h' ? g[2] : g[3];
      const off = side === 'h' ? 0 : 1;
      const runs = side === 'h' ? hr : ar;
      const won = card.state === 'final' && g[6] === h;
      const rawName = index.schools[h]?.[0] || '';
      const name = shortName(rawName);
      const location = place(rawName);
      return <div className={`yfp-green-row${h===me?' me':''}${won?' won':''}`}>
        <button type="button" className="yfp-green-team" disabled={!played} onClick={()=>onOpen({card,side})}
          aria-label={played ? `${name}: this week's players` : undefined}>
          <span className="yfp-green-abbr">{abbr(name)}</span>
          <span className="yfp-green-full">{name}</span>
          {location ? <span className="yfp-green-place">{location}</span> : null}
        </button>
        {Array.from({ length: inningCount }, (_, i) => i).map((i)=>{
          const shown = card.state === 'final' || (card.state === 'live' && i < Math.min(shownDays(g, card.days), 9));
          const value = g[5][i*2+off] || 0;
          return <span key={i} className={`yfp-green-slot${shown && value ? ' scored' : ''}`}>{shown ? value : ''}</span>;
        })}
        <span className="yfp-green-run">{played ? runs : ''}{won ? <i aria-label="winner">◀</i> : null}</span>
        <StatsDot name={name} onOpen={played ? ()=>onOpen({card,side}) : undefined} />
      </div>;
    };

    const scoreboard = <>
      <div className="yfp-score-head">
        <span>Week {g[1]} | {index.weeks[g[1]-1] ? fmtRange(index.weeks[g[1]-1][0],index.weeks[g[1]-1][1]) : ''}</span>
        <span>{stageHead}{g[1] < 33 ? ` | Game ${gameNo}` : ''}</span>
      </div>
      <div className="yfp-green-board" style={{ '--inning-count': inningCount } as React.CSSProperties}>
        <div className="yfp-green-row head">
          <span className={`yfp-green-status ${card.state}`}>{pill}</span>
          {Array.from({ length: inningCount }, (_, i) => i + 1).map((n)=><span key={n}>{n}</span>)}
          <span className="run">R</span>
          <span className="stats">DAILY<br />STATS</span>
        </div>
        {row('a')}{row('h')}
      </div>
    </>;

    const awayName = shortName(index.schools[g[3]]?.[0] || '');
    const homeName = shortName(index.schools[g[2]]?.[0] || '');
    const social = <FantasyGameSocial
      gameKey={`sim-2026:${g[0]}`}
      title={label}
      subtitle={`${awayName} ${ar} · ${homeName} ${hr}`}
      shareText={`Follow the YAT?STATS High School Alumni Fantasy Game between ${awayName} and ${homeName}.`}
      shareUrl={typeof window==='undefined'?'':`${window.location.origin}${window.location.pathname}?fantasyGame=${g[0]}&week=${g[1]}#sec-fantasy`}
      preview={<div className="yfp-scorecard">{scoreboard}</div>}
    />;

    return <article key={g[0]} className={`yfp-card yfp-scorecard yfp-post-game ${card.state}`} id={`postgame-${g[0]}`}>
      {social ? <div className="yfp-game-split">
        <div className="yfp-game-scorepane">{scoreboard}</div>
        <div className="yfp-game-socialpane">{social}</div>
      </div> : scoreboard}
      {played ? <PostGameRecap index={index} game={g} file={file} /> : null}
    </article>;
  };

  let cards: React.ReactNode;
  if(stage==='c1'){
    cards = <>
      {stageKnown(31)
        ? games(31).map((g,i)=>gameCard(g,`Season Championship Round 1 · Game ${i+1}`,'d-lbt'))
        : Array.from({ length: 4 }, (_, i) => blankScoreboard(31,'Championship Round 1',i+1))}
      {week31Announcement}
    </>;
  } else if(stage==='c2'){
    cards = <>
      {stageKnown(32)
        ? games(32).map((g,i)=>gameCard(g,`Season Championship Round 2 · Game ${i+1}`,'d-lbt'))
        : <>
            {Array.from({ length: 2 }, (_, i) => blankScoreboard(32,'Championship Round 2',i+1))}
            {waitingCard('Season Championship Round 2', 'The semifinal field will be set after Championship Round 1 is complete.')}
          </>}
      {bracketChampionKnown ? <InfoCard kicker="BRACKET CHAMPION · BYE" title={championName}
        body="The 10-round Bracket Champion is waiting for the winner of the eight-team single-elimination Season Championship Tournament." /> : null}
    </>;
  } else if(stage==='cg'){
    const g=stageKnown(33) ? games(33)[0] : null;
    cards = <>
      {g ? gameCard(g,'Season Championship Game','d-lbt')
        : <>
            {blankScoreboard(33,'Championship Game')}
            {waitingCard('Season Championship Game', 'The finalists will be set after Championship Round 2 is complete.')}
          </>}
      {bracketChampionKnown ? <InfoCard kicker="BRACKET CHAMPION · BYE" title={championName}
        body="Waiting for the winner of this Championship Game. The winner advances to the YAT?STATS World Series." /> : null}
      {bracketChampionKnown ? <InfoCard kicker="WORLD SERIES TICKETS RAFFLE" title="Bracket Champion fans"
        body="Registered fans of the Bracket Champion whose names will be entered in the World Series tickets raffle."
        rows={bracketFans}
        onOpen={()=>setDrawer({title:'World Series raffle entries',kicker:`${championName} registered fans`,rows:bracketFans})} /> : null}
    </>;
  } else {
    const g=stageKnown(34) ? (index.gf.find((x)=>x[1]===34) || index.gf[0]) : null;
    cards = <>
      {g ? gameCard(g,'YAT?STATS World Series','d-gf')
        : <>
            {blankScoreboard(34,'YAT?STATS World Series')}
            {waitingCard('YAT?STATS World Series', 'The matchup will be set after the Season Championship Game is complete.')}
          </>}
      {qualifiersKnown ? <InfoCard kicker="REGIONAL LUCKYFANS" title="Active Alumni LuckyFan selections"
        body="Every Active Alumni from each of the eight Regional Champions personally selects one LuckyFan for the World Series ticket drawing."
        rows={topFans}
        onOpen={()=>setDrawer({title:'Regional LuckyFan selections',kicker:'One selection per Active Alumni',rows:topFans,note:'Blank slots fill only when each Active Alumni makes a verified LuckyFan selection.'})} /> : null}
      {bracketChampionKnown ? <InfoCard kicker="WORLD SERIES TICKETS RAFFLE" title="Bracket Champion fans"
        body="The Bracket Champion fan list stays visible through the final World Series week."
        rows={bracketFans}
        onOpen={()=>setDrawer({title:'World Series raffle entries',kicker:`${championName} registered fans`,rows:bracketFans,note:'All entries must be submitted by 11:59 PM September 26, 2027.'})} /> : null}
    </>;
  }

  return <>
    <div className={`yfz-cards yfp-postseason-cards ${stage}`}>{cards}</div>
    {drawer ? <InfoDrawer {...drawer} onClose={()=>setDrawer(null)} /> : null}
    <style jsx global>{`
      .yfp-postseason-cards{align-items:stretch}
      .yfp-post-game{padding:0;overflow:hidden}
      .yfp-post-card{min-height:230px;display:flex;flex-direction:column;overflow:hidden;border-color:rgba(255,210,74,.28);background:linear-gradient(180deg,rgba(255,210,74,.075),rgba(255,255,255,.025))}
      .yfp-post-kicker{color:var(--yfp-gold);font:800 9px/1 Oswald,sans-serif;letter-spacing:.11em;text-transform:uppercase;margin-bottom:7px}
      .yfp-post-title{color:var(--yfp-strong);font:700 22px/.95 "Bebas Neue",Oswald,sans-serif;letter-spacing:.025em;text-transform:uppercase}
      .yfp-post-body{margin:8px 0;color:var(--yfp-muted);font:500 11px/1.35 var(--yfp-sb),"Arial Narrow",Oswald,sans-serif}
      .yfp-post-body p{margin:0 0 9px}
      .yfp-post-body p:last-child{margin-bottom:0}
      .yfp-post-body b{color:var(--yfp-strong)}
      .yfp-madlib-line{color:var(--yfp-gold);font-weight:800;letter-spacing:.08em}
      .yfp-post-preview{flex:1;min-height:0;max-height:125px;overflow-y:auto;overscroll-behavior:contain;border-top:1px solid var(--yfp-card-border);margin-top:4px;padding-top:4px;scrollbar-width:thin}
      .yfp-post-preview>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;padding:3px 1px;border-bottom:1px solid var(--yfp-card-border);font:500 9px/1.2 var(--yfp-sb),"Arial Narrow",Oswald,sans-serif}
      .yfp-post-preview b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--yfp-strong);font-weight:700}
      .yfp-post-preview span{color:var(--yfp-muted);text-align:right}
      .yfp-post-open{margin-top:7px;width:100%;min-height:30px;border:1px solid var(--yfp-gold);background:rgba(255,210,74,.08);color:var(--yfp-gold);font:800 9px/1 Oswald,sans-serif;letter-spacing:.09em;text-transform:uppercase;cursor:pointer}
      .yfp-post-recap{display:flex;gap:7px;align-items:baseline;padding:5px 7px 6px;border-top:1px solid var(--yfp-card-border);background:rgba(0,0,0,.12);font:500 8.5px/1.25 var(--yfp-sb),"Arial Narrow",Oswald,sans-serif}
      .yfp-post-recap b{flex:none;color:var(--yfp-gold);font-size:7.5px;letter-spacing:.08em}
      .yfp-post-recap span{color:var(--yfp-muted)}

      .yfp-post-mask{position:fixed;inset:0;z-index:2147483300;background:rgba(0,0,0,.5)}
      .yfp-post-drawer{position:absolute;top:0;bottom:0;right:0;width:min(520px,94vw);display:flex;flex-direction:column;overflow:hidden;background:#141820;color:#e9ecf1;box-shadow:0 0 30px rgba(0,0,0,.45)}
      .yfp-post-drawer-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #262c37}
      .yfp-post-drawer-head>div{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.yfp-post-drawer-head b{color:#ffd24a;font:700 18px/1 Oswald,sans-serif}.yfp-post-drawer-head span{color:#8b93a1;font:600 10px/1.2 Oswald,sans-serif;text-transform:uppercase;letter-spacing:.08em}
      .yfp-post-drawer-head button{width:34px;height:34px;border:1px solid #363d49;border-radius:50%;background:transparent;color:#fff;cursor:pointer}
      .yfp-post-drawer-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:8px 14px;scrollbar-width:thin}
      .yfp-post-drawer-scroll ol{list-style:none;margin:0;padding:0}.yfp-post-drawer-scroll li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:8px 2px;border-bottom:1px solid #262c37}.yfp-post-drawer-scroll li b{font:700 13px/1.2 Oswald,sans-serif}.yfp-post-drawer-scroll li span{color:#8b93a1;font:500 10px/1.2 Oswald,sans-serif;text-align:right}
      .yfp-post-drawer-note{margin:0;padding:9px 14px 12px;border-top:1px solid #262c37;color:#8b93a1;font:500 10px/1.35 Oswald,sans-serif}
      @media(max-width:899px){.yfp-raffle-cta{grid-template-columns:1fr;gap:7px}.yfp-raffle-cta button{width:100%}.yfp-post-card{min-height:220px}}
    `}</style>
  </>;
}
