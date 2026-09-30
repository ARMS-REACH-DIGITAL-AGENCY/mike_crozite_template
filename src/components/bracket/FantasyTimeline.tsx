'use client';

// src/components/bracket/FantasyTimeline.tsx
// One hero slide per bracket ROUND (not per week). Each round slide grows as
// its three weekly games are played, then remains as the permanent round
// recap. The bottom R1-R10 dock and this hero therefore speak the same
// language: one button = one round = one slide.

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SchoolContext } from '@/context/SchoolContext';
import { CREST_FALLBACK_PATH, getSchoolCrestUrl } from '@/lib/schoolAssets';
import { type Index, type LbGame, fmtRange, loadIndex, loadLb, previewDate, runsOf, shortName } from './gallery';
import { type CurrentPlayerIdentity, type Star, type WeekCard, calendar, loadCurrentPlayerIdentities, loadStars, schoolSeason, starLine } from './schoolSeason';
import { type FantasyStageKey, FANTASY_STAGE_KEYS, focusWeek, selectStage, stageKeyForWeek, useBracketNav } from './bracketNav';

const S3_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
const SILHOUETTE = '/img/player-silhouette.png';

const currentPlayerImages = (id: string, designatedHeadshot?: string | null) => [
  `${S3_BASE}/players/back-web/${encodeURIComponent(id)}.webp`,
  `/api/cutout?kind=back&id=${encodeURIComponent(id)}`,
  ...(designatedHeadshot ? [designatedHeadshot] : []),
  `${S3_BASE}/players/now-web/${encodeURIComponent(id)}.webp`,
  `/api/cutout?kind=now&id=${encodeURIComponent(id)}`,
  SILHOUETTE,
];

function Fallback({ srcs, className, alt }: { srcs: string[]; className: string; alt: string }) {
  const [i, setI] = useState(0);
  if (i >= srcs.length) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={srcs[i]} alt={alt} loading="lazy" decoding="async" onError={() => setI((v) => v + 1)} />;
}

type RoundSlide = {
  round: number;
  cards: WeekCard[];
  done: WeekCard[];
  wins: number;
  losses: number;
  title: string;
  summary: string;
  opponent: number;
  heroStar?: Star;
  heroIdentity?: CurrentPlayerIdentity;
  firstWeek: number;
  lastWeek: number;
  complete: boolean;
};

function scoreFor(card: WeekCard, me: number): [number, number] | null {
  if (!card.game || card.state !== 'final') return null;
  const [hr, ar] = runsOf(card.game[5]);
  return card.game[2] === me ? [hr, ar] : [ar, hr];
}

function roundTitle(round: number, done: number, wins: number, losses: number) {
  if (!done) return `ROUND ${round}`;
  if (done < 3) return `ROUND ${round} IN PROGRESS`;
  if (wins === 3) return 'THE DOMINATOR!';
  if (wins >= 2) return `ROUND ${round} WON`;
  if (losses >= 2) return `ROUND ${round} COMPLETE`;
  return `ROUND ${round}`;
}

function buildSummary(index: Index, slide: Omit<RoundSlide, 'summary' | 'title' | 'heroIdentity'>, me: number, stars: Record<number, Star>) {
  const schoolName = shortName(index.schools[me]?.[0] || 'This school');
  const oppName = slide.opponent ? shortName(index.schools[slide.opponent]?.[0] || '') : '';
  if (!slide.done.length) {
    return `${schoolName} begins Round ${slide.round} in weeks ${slide.firstWeek}-${slide.lastWeek}. Each weekly game adds to the three-game series and the Most Runs Scored race.`;
  }
  const record = `${slide.wins}-${slide.losses}`;
  const finalWord = slide.complete ? 'finished' : 'stands';
  const names = slide.done.map((c) => stars[c.week]?.[0]).filter(Boolean);
  const notable = [...new Set(names)].slice(0, 3);
  const starText = notable.length ? ` Alumni of the Week so far: ${notable.join(', ')}.` : '';
  return `${schoolName} ${finalWord} Round ${slide.round} ${record}${oppName ? ` against ${oppName}` : ''}.${starText}`;
}

function seriesStatus(slide: RoundSlide, schoolName: string, opponentName: string) {
  if (!slide.done.length) return `ROUND ${slide.round}`;
  if (slide.complete) {
    if (slide.wins >= 2) return `${schoolName.toUpperCase()} ADVANCES`;
    if (slide.losses >= 2) return `${opponentName.toUpperCase()} ADVANCES`;
    return `SERIES COMPLETE ${slide.wins}-${slide.losses}`;
  }
  if (slide.wins === slide.losses) return `SERIES TIED ${slide.wins}-${slide.losses}`;
  if (slide.wins > slide.losses) return `${schoolName.toUpperCase()} LEADS SERIES ${slide.wins}-${slide.losses}`;
  return `${opponentName.toUpperCase()} LEADS SERIES ${slide.losses}-${slide.wins}`;
}

function Slide({ index, slide, me, onTap }: { index: Index; slide: RoundSlide; me: number; onTap: () => void }) {
  const schoolName = shortName(index.schools[me]?.[0] || '');
  const dates = fmtRange(index.weeks[slide.firstWeek - 1]?.[0] || '', index.weeks[slide.lastWeek - 1]?.[1] || '');
  const wonRound = slide.complete && slide.wins >= 2;
  const seriesLabel = slide.done.length ? `${schoolName} ${wonRound ? 'Wins' : slide.complete ? 'Finishes' : 'Leads'} (${slide.wins}-${slide.losses})` : 'Series not started';
  const oppLabel = slide.opponent ? shortName(index.schools[slide.opponent]?.[0] || 'Opponent') : 'Opponent';
  const status = seriesStatus(slide, schoolName, oppLabel);

  return (
    <div className="yft-slide" role="button" tabIndex={0} onClick={onTap}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } }}
      aria-label={`Round ${slide.round}. ${seriesLabel}`}>
      {slide.opponent ? <Fallback className="yft-ghost" srcs={[getSchoolCrestUrl(slide.opponent), CREST_FALLBACK_PATH]} alt="" /> : null}
      <span className="yft-grad" aria-hidden="true" />
      {slide.heroStar
        ? <Fallback className="yft-person" srcs={currentPlayerImages(slide.heroStar[5], slide.heroIdentity?.headshotUrl)} alt={slide.heroStar[0]} />
        : <span className="yft-mark" aria-hidden="true">{slide.opponent ? <Fallback className="yft-mark-crest" srcs={[getSchoolCrestUrl(slide.opponent), CREST_FALLBACK_PATH]} alt="" /> : '?'}</span>}

      <div className="yft-left-meta">
        <b>ROUND {slide.round}</b>
        <span>{dates}</span>
      </div>

      <div className="yft-story">
        <span className="yft-status">{status}</span>
        <strong className="yft-title">{slide.title}</strong>
        <p>{slide.summary}</p>
        {slide.heroStar ? (
          <a className="yft-star" href={`/${me}/player/${encodeURIComponent(slide.heroStar[5])}`} onClick={(e) => e.stopPropagation()}>
            ★ {starLine(slide.heroStar, slide.heroIdentity)}
          </a>
        ) : null}
      </div>

      <aside className="yft-series" aria-label={`Round ${slide.round} series`}>
        <div className="yft-series-games">
          {slide.cards.map((card, i) => {
            const score = scoreFor(card, me);
            const opp = card.game ? (card.game[2] === me ? card.game[3] : card.game[2]) : slide.opponent;
            const oppName = opp ? shortName(index.schools[opp]?.[0] || 'Opponent') : 'TBD';
            return (
              <div key={card.week} className="yft-series-game">
                <span>{score ? <>{oppName} {score[1]}<br /><em>{schoolName} {score[0]}</em></> : <>Week {card.week}<br /><em>TBD</em></>}</span>
                <small>G{i + 1}</small>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function PostSlide({ index, card, me, keyName, label, title, onTap }: {
  index:Index; card?:WeekCard; me:number; keyName:string; label:string; title:string; onTap:()=>void;
}) {
  const schoolName=shortName(index.schools[me]?.[0]||'');
  const dates=card ? fmtRange(index.weeks[card.week-1]?.[0]||'',index.weeks[card.week-1]?.[1]||'') : '';
  const score=card ? scoreFor(card,me) : null;
  const opp=card?.game ? (card.game[2]===me?card.game[3]:card.game[2]) : 0;
  const oppName=opp?shortName(index.schools[opp]?.[0]||'Opponent'):'TBD';
  const status=card?.state==='bye'?'BYE':card?.state==='final'&&score?(score[0]>score[1]?schoolName.toUpperCase()+' WINS':oppName.toUpperCase()+' WINS'):card?.state==='live'?'IN PROGRESS':'UPCOMING';
  return (
    <div className="yft-slide" role="button" tabIndex={0} onClick={onTap}
      onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onTap();}}}
      aria-label={title}>
      <span className="yft-grad" aria-hidden="true"/>
      <div className="yft-left-meta"><b>{label}</b><span>{dates}</span></div>
      <div className="yft-story">
        <span className="yft-status">{status}</span>
        <strong className="yft-title">{title}</strong>
        <p>{card?.note || (opp ? `${schoolName} vs ${oppName}.` : 'This stage is set when the prior stage is complete.')}</p>
      </div>
      <aside className="yft-series">
        <div className="yft-series-games">
          <div className="yft-series-game">
            <span>{score?<>{oppName} {score[1]}<br/><em>{schoolName} {score[0]}</em></>:<>Week {card?.week||''}<br/><em>{card?.state==='bye'?'BYE':'TBD'}</em></>}</span>
            <small>{label}</small>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function FantasyTimeline() {
  const school = useContext(SchoolContext);
  const me = Number(school?.hsid || 0);
  const [data, setData] = useState<{ index: Index; lb: LbGame[]; asof: string } | null>(null);
  const [stars, setStars] = useState<Record<number, Star>>({});
  const [identities, setIdentities] = useState<Record<string, CurrentPlayerIdentity>>({});
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadIndex(), loadLb()]).then(([index, lb]) => { if (!cancelled) setData({ index, lb, asof: previewDate() }); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const cards = useMemo(() => (data ? schoolSeason(data.index, data.lb, me, data.asof) : []), [data, me]);
  const cal = data ? calendar(data.index, data.asof) : null;
  const region = data?.index.schools[me]?.[1];

  useEffect(() => {
    if (!region) return;
    let cancelled = false;
    loadStars(region).then((all) => { if (!cancelled) setStars(all[me] || {}); });
    return () => { cancelled = true; };
  }, [region, me]);

  useEffect(() => {
    const ids = Object.values(stars).map((s) => s[5]);
    if (!ids.length) { setIdentities({}); return; }
    let cancelled = false;
    loadCurrentPlayerIdentities(ids).then((rows) => { if (!cancelled) setIdentities(rows); });
    return () => { cancelled = true; };
  }, [stars]);

  const rounds = useMemo<RoundSlide[]>(() => {
    if (!data) return [];
    return Array.from({ length: 10 }, (_, i) => {
      const round = i + 1;
      const firstWeek = i * 3 + 1;
      const lastWeek = firstWeek + 2;
      const list = cards.filter((c) => c.week >= firstWeek && c.week <= lastWeek);
      const done = list.filter((c) => c.state === 'final' && c.game);
      const wins = done.filter((c) => c.game?.[6] === me).length;
      const losses = done.filter((c) => c.game?.[6] !== null && c.game?.[6] !== me).length;
      const opponent = list.map((c) => c.game ? (c.game[2] === me ? c.game[3] : c.game[2]) : 0).find(Boolean) || 0;
      const heroWeek = [...done].reverse().find((c) => stars[c.week])?.week;
      const heroStar = heroWeek ? stars[heroWeek] : undefined;
      const base = { round, cards: list, done, wins, losses, opponent, heroStar, firstWeek, lastWeek, complete: done.length === 3 };
      return {
        ...base,
        title: roundTitle(round, done.length, wins, losses),
        summary: buildSummary(data.index, base, me, stars),
        heroIdentity: heroStar ? identities[heroStar[5]] : undefined,
      };
    });
  }, [cards, data, identities, me, stars]);

  const go = useCallback((i: number, smooth = true) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const nav=useBracketNav();
  const stageKeys:FantasyStageKey[]=[...FANTASY_STAGE_KEYS];
  const postStages=[
    {key:'c1',label:'C1',title:'CHAMPIONSHIP ROUND 1',week:31},
    {key:'c2',label:'C2',title:'CHAMPIONSHIP ROUND 2',week:32},
    {key:'cg',label:'CG',title:'CHAMPIONSHIP GAME',week:33},
    {key:'yws',label:'YWS',title:'YAT?STATS WORLD SERIES',week:34},
  ] as const;

  useEffect(()=>{
    if(!rounds.length)return;
    const initial=nav.stageKey||stageKeyForWeek(Math.max(1,Math.min(34,cal?.week||1)));
    const i=Math.max(0,stageKeys.indexOf(initial));
    requestAnimationFrame(()=>{go(i,false);setActive(i);if(!nav.stageKey)selectStage(initial);});
  },[rounds.length,cal?.week,go]);

  useEffect(()=>{
    if(!nav.stageKey)return;
    const i=stageKeys.indexOf(nav.stageKey);
    if(i>=0&&i!==active){go(i);setActive(i);}
  },[nav.stageSeq,nav.stageKey,go]);

  const onScroll=()=>{
    const el=trackRef.current;
    if(!el)return;
    const i=Math.max(0,Math.min(stageKeys.length-1,Math.round(el.scrollLeft/Math.max(1,el.clientWidth))));
    setActive(i);
    const key=stageKeys[i];
    if(key&&key!==nav.stageKey)selectStage(key);
  };

  if (!data || !rounds.length) return <section className="yft-hero" aria-label="The season, round by round" />;

  return (
    <section className="yft-hero" aria-label="The season, round by round">
      <div className="yft-track" ref={trackRef} onScroll={onScroll}>
        {rounds.map((r)=>{
          const focus=r.cards.find(c=>c.week===cal?.week)||[...r.done].reverse()[0]||r.cards[0];
          const key=`r${r.round}`;
          return <Slide key={key} index={data.index} slide={r} me={me} onTap={()=>{selectStage(key);if(focus)focusWeek(focus.week);}}/>;
        })}
        {postStages.map((s)=>{
          const card=cards.find(c=>c.week===s.week);
          return <PostSlide key={s.key} index={data.index} card={card} me={me} keyName={s.key} label={s.label} title={s.title}
            onTap={()=>{selectStage(s.key);if(card)focusWeek(card.week);}}/>;
        })}
      </div>

      <button type="button" className="yft-nav prev" onClick={()=>{const i=Math.max(0,active-1);selectStage(stageKeys[i]);go(i);}} disabled={active===0} aria-label="Previous stage">‹</button>
      <button type="button" className="yft-nav next" onClick={()=>{const i=Math.min(stageKeys.length-1,active+1);selectStage(stageKeys[i]);go(i);}} disabled={active===stageKeys.length-1} aria-label="Next stage">›</button>

      <div className="yft-rail" aria-label="Season timeline">
        <span className="yft-rail-track" aria-hidden="true"/>
        {stageKeys.map((key,i)=>{
          const label=i<10?`R${i+1}`:i===10?'R1':i===11?'R2':i===12?'CS':'WS';
          const r=i<10?rounds[i]:null;
          const cls=`${r?.complete&&r.wins>=2?' W':r?.complete&&r.losses>=2?' L':''}${i===active?' on':''}${key===stageKeyForWeek(cal?.week||1)?' now':''}`;
          return <button key={key} type="button" className={`yft-tick${cls}`} style={{left:`${(i/(stageKeys.length-1))*100}%`}}
            onClick={()=>{selectStage(key);go(i);}} aria-label={key}><span className="yft-tick-label">{label}</span></button>;
        })}
      </div>
      <style jsx global>{`
        /* Keep Fantasy in the exact player-profile Career Path Timeline box.
           We are swapping content, not changing the page geometry. */
        .yat-row3-shell:has(.yft-hero) { height:200px !important; min-height:200px !important; overflow:hidden !important; }
        .yft-hero { position:relative; height:200px; min-height:200px; overflow:hidden; background:#050505; color:#fff; border-bottom:1px solid rgba(255,255,255,.08); }
        .yft-track { display:flex; height:100%; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none; overscroll-behavior-x:contain; }
        .yft-track::-webkit-scrollbar { display:none; }
        .yft-slide { position:relative; flex:0 0 100%; height:100%; scroll-snap-align:start; overflow:hidden; cursor:pointer; }
        .yft-ghost { position:absolute; left:3%; top:50%; width:33%; height:92%; transform:translateY(-50%); opacity:.09; object-fit:contain; pointer-events:none; }
        .yft-grad { position:absolute; inset:0; pointer-events:none; background:linear-gradient(90deg,rgba(0,0,0,.05) 0%,rgba(0,0,0,.2) 26%,rgba(5,5,5,.82) 42%,#050505 72%); }
        .yft-person { position:absolute; left:1%; bottom:25px; width:27%; height:calc(100% - 30px); object-fit:contain; object-position:bottom center; pointer-events:none; }
        .yft-left-meta { position:absolute; left:2.5%; top:12px; z-index:2; display:flex; flex-direction:column; gap:2px; color:#fff; }
        .yft-left-meta b { font:700 16px/1 Oswald,sans-serif; }
        .yft-left-meta span { font:500 10px/1.1 system-ui,sans-serif; color:rgba(255,255,255,.78); }
        .yft-mark { position:absolute; left:7%; top:48%; transform:translateY(-50%); width:110px; height:110px; display:grid; place-items:center; color:#555; font:400 64px/1 "Bebas Neue",Oswald,sans-serif; }
        .yft-mark-crest { width:100%; height:100%; object-fit:contain; }
        .yft-story { position:absolute; left:28%; right:22%; top:18px; bottom:34px; display:flex; flex-direction:column; justify-content:center; min-width:0; padding:0 14px; }
        .yft-dates { color:rgba(255,255,255,.82); font:500 12px/1.2 system-ui,sans-serif; }
        .yft-status { color:rgba(255,255,255,.86); font:700 13px/1 Oswald,sans-serif; letter-spacing:.03em; text-transform:uppercase; }
        .yft-title { margin:7px 0 5px; color:#fff; font:700 clamp(26px,3.5vw,42px)/.95 Oswald,sans-serif; letter-spacing:.01em; text-transform:uppercase; }
        .yft-story p { margin:0; max-width:780px; color:rgba(255,255,255,.78); font:400 13px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace; }
        .yft-star { margin-top:8px; color:var(--gold,#d5b44a); font:600 10px/1.2 Oswald,sans-serif; letter-spacing:.06em; text-decoration:none; text-transform:uppercase; }
        .yft-series { position:absolute; right:3%; top:18px; bottom:35px; width:19%; min-width:150px; display:flex; flex-direction:column; align-items:flex-end; justify-content:center; text-align:right; }
        .yft-series>b { color:#fff; font:700 22px/1 Oswald,sans-serif; }
        .yft-series>span { margin-top:4px; color:rgba(255,255,255,.85); font:600 11px/1.2 Oswald,sans-serif; }
        .yft-series-games { margin-top:11px; width:100%; display:grid; gap:6px; }
        .yft-series-game { display:grid; grid-template-columns:1fr 22px; gap:5px; align-items:start; color:rgba(255,255,255,.72); font:500 10px/1.15 Oswald,sans-serif; }
        .yft-series-game small { color:var(--gold,#d5b44a); font:700 8px/1.2 Oswald,sans-serif; text-align:right; }
        .yft-series-game em { color:#fff; font-style:normal; font-weight:700; }
        .yft-nav { position:absolute; top:50%; transform:translateY(-50%); width:30px; height:46px; border:0; background:rgba(0,0,0,.35); color:#fff; font-size:26px; line-height:1; cursor:pointer; z-index:4; }
        .yft-nav:disabled { opacity:.2; cursor:default; }
        .yft-nav.prev { left:0; }
        .yft-nav.next { right:0; }
        .yft-rail { position:absolute; left:29%; right:23%; bottom:10px; height:18px; z-index:4; }
        .yft-rail-track { position:absolute; left:0; right:0; top:8px; height:2px; background:rgba(255,255,255,.18); }
        .yft-tick { position:absolute; top:1px; width:14px; height:14px; margin-left:-7px; padding:0; border:0; background:transparent; cursor:pointer; }
        .yft-tick:disabled { cursor:default; }
        .yft-tick::before { content:''; position:absolute; left:4px; top:3px; width:6px; height:8px; border-radius:1px; background:rgba(255,255,255,.42); }
        .yft-tick.W::before { background:#78c988; }
        .yft-tick.L::before { background:#d46f66; }
        .yft-tick.on::before,.yft-tick.now::before { box-shadow:0 0 0 2px rgba(213,180,74,.72); }
        .yft-tick-label { position:absolute; left:50%; top:-10px; transform:translateX(-50%); color:rgba(255,255,255,.48); font:700 7px/1 Oswald,sans-serif; }

        @media (max-width:760px) {
          body:has(.yft-hero) { --row3-h:118px; }
          .yat-row3-shell:has(.yft-hero) { height:118px !important; min-height:118px !important; }
          .yft-hero { height:118px; min-height:118px; }
          .yft-person { left:0; width:27%; height:calc(100% - 26px); bottom:13px; }
          .yft-ghost { left:0; width:31%; }
          .yft-left-meta { left:2.5%; top:5px; gap:1px; }
          .yft-left-meta b { font-size:10px; }
          .yft-left-meta span { font-size:6px; }
          .yft-story { left:28%; right:24%; top:5px; bottom:20px; padding:0 5px; justify-content:flex-start; }
          .yft-status { font-size:6.5px; line-height:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .yft-title { margin:2px 0 2px; font-size:16px; line-height:.94; }
          .yft-story p { font-size:7px; line-height:1.14; display:-webkit-box; -webkit-line-clamp:5; -webkit-box-orient:vertical; overflow:hidden; }
          .yft-star { margin-top:2px; font-size:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .yft-series { right:1.2%; top:5px; bottom:20px; width:23%; min-width:0; justify-content:flex-start; }
          .yft-series-games { margin-top:0; gap:4px; }
          .yft-series-game { grid-template-columns:1fr 13px; gap:2px; font-size:7px; line-height:1.02; }
          .yft-series-game small { font-size:5.8px; text-align:right; }
          .yft-nav { display:none; }
          .yft-rail { left:28%; right:2%; bottom:3px; height:14px; }
          .yft-rail-track { top:6px; height:1px; }
          .yft-tick { width:10px; height:10px; margin-left:-5px; top:1px; }
          .yft-tick::before { left:3px; top:2px; width:4px; height:6px; }
          .yft-tick-label { display:block; top:-7px; font-size:4.3px; color:rgba(255,255,255,.55); }
        }
      `}</style>
    </section>
  );
}
