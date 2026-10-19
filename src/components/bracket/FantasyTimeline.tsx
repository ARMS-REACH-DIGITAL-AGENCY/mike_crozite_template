'use client';

// src/components/bracket/FantasyTimeline.tsx
// One hero slide per bracket ROUND. The timeline under it has a dot for
// every week (34): a big one where each round and postseason stage starts,
// small ones for a round's second and third weeks. Picking a week shows its
// stories - every inning as it posts (1st-7th, the 8th's week totals, the
// 9th's W-L) and then the final's recap - dissolving from one to the next,
// and they stay there for the rest of the season.

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SchoolContext } from '@/context/SchoolContext';
import { CREST_FALLBACK_PATH, getSchoolCrestUrl } from '@/lib/schoolAssets';
import { type GameBox, type GameRow, type Index, type LbGame, type PlayerRow, loadBoxes, loadIndex, loadLb, previewDate, runsOf, shortName } from './gallery';
import { type CurrentPlayerIdentity, type Star, type WeekCard, calendar, leadWeek, loadCurrentPlayerIdentities, loadStars, schoolSeason, starLine } from './schoolSeason';
import { type DayStory, weekStories } from './dayStory';
import { type FantasyStageKey, FANTASY_STAGE_KEYS, focusWeek, selectStage, stageKeyForWeek, useBracketNav } from './bracketNav';
import BallparkScene from './BallparkScene';

const S3_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
const SILHOUETTE = '/img/player-silhouette.png';
// YaTi character stand-ins for the hero spot until a player of the week is known.
const YATI_HEROES = [
  '/img/yati-placeholders/yati-standing-hips.webp',
  '/img/yati-placeholders/yati-running-field.webp',
  '/img/yati-placeholders/yati-catcher-back.webp',
  '/img/yati-placeholders/yati-thinking.webp',
];

function openRaffleRegistration() {
  if (typeof window === 'undefined') return;
  document.body.classList.add('drawer-account-open', 'drawer-open');
  document.body.classList.remove('drawer-left-open', 'drawer-sort-open', 'drawer-right-open', 'drawer-favorites-open');
  window.dispatchEvent(new CustomEvent('yat:acct-tab', { detail: 'register' }));
  const drawer = document.getElementById('drawerAccount');
  const mask = document.getElementById('drawerMask');
  drawer?.classList.add('open', 'is-open', 'active');
  drawer?.setAttribute('aria-hidden', 'false');
  mask?.classList.add('open', 'is-open', 'active');
}

function RafflePolaroidCTA() {
  return (
    <button type="button" className="yft-raffle-cta" onClick={(e) => { e.stopPropagation(); openRaffleRegistration(); }}
      aria-label="Register to win four tickets to the 2027 World Series">
      <img className="yft-raffle-trophy" src="/img/world-series-trophy-cta.jpg" alt="" aria-hidden="true" />
      <span className="yft-raffle-note">Register<br />To Win<br />World<br />Series<br />Tickets!</span>
    </button>
  );
}

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
  stories: Record<number, (DayStory & { label: string })[]>; // each week's stories, in order
  defaultWeek: number; // the week the slide opens on
};

type Story = DayStory & { label: string };
// How long each story shows before dissolving into the next: a game in
// progress 10s, a finished one 6s.
const LIVE_STORY_MS = 10_000;
const FINAL_STORY_MS = 6_000;

function scoreFor(card: WeekCard, me: number): [number, number] | null {
  if (!card.game || card.state !== 'final') return null;
  const [hr, ar] = runsOf(card.game[5]);
  return card.game[2] === me ? [hr, ar] : [ar, hr];
}

function starHeadline(star: Star | undefined, round: number, done: number, wins: number, losses: number) {
  if (!star) {
    if (!done) return `ROUND ${round}`;
    if (done < 3) return `GAME ${done + 1} UP NEXT`;
    if (wins >= 2) return `ROUND ${round} WON`;
    if (losses >= 2) return `ROUND ${round} COMPLETE`;
    return `ROUND ${round}`;
  }
  const parts = star[0].trim().split(/\s+/);
  const surname = (parts[parts.length - 1] || star[0]).toUpperCase();
  const value = star[3];
  if (star[2] === 'bat') {
    if (value >= 250) return `${surname} ERUPTS`;
    if (value >= 180) return `${surname} POWERS THE WEEK`;
    if (value >= 140) return `${surname} STAYS HOT`;
    return `${surname} DELIVERS`;
  }
  if (value <= 35) return `${surname} SHUTS IT DOWN`;
  if (value <= 60) return `${surname} DEALS`;
  if (value <= 80) return `${surname} LOCKS IT DOWN`;
  return `${surname} DELIVERS`;
}

function buildSummary(index: Index, slide: Omit<RoundSlide, 'summary' | 'title' | 'heroIdentity' | 'stories' | 'defaultWeek'>, me: number, stars: Record<number, Star>) {
  const schoolName = shortName(index.schools[me]?.[0] || 'This school');
  const oppName = slide.opponent ? shortName(index.schools[slide.opponent]?.[0] || '') : '';
  if (!slide.done.length) {
    return `${schoolName} begins Round ${slide.round} in weeks ${slide.firstWeek}-${slide.lastWeek}. Each weekly game adds to the three-game series and the Most Runs Scored race.`;
  }
  const names = slide.done.map((c) => stars[c.week]?.[0]).filter(Boolean);
  const notable = [...new Set(names)].slice(0, 3);
  const starText = notable.length ? ` Alumni of the Week so far: ${notable.join(', ')}.` : '';
  return `${seriesSentence(slide, schoolName, oppName)}${starText}`;
}

// Where the series stands, in a sentence: "Cardinal Newman leads the series
// 1-0.", "The series is tied 1-1.", "Hamilton wins the series 2-1 and
// advances."
function seriesSentence(slide: { done: WeekCard[]; wins: number; losses: number; complete: boolean }, schoolName: string, opponentName: string) {
  if (!slide.done.length) return '';
  const { wins: w, losses: l } = slide;
  if (w >= 2) return `${schoolName} wins the series ${w}-${l} and advances.`;
  if (l >= 2) return `${opponentName || 'The opponent'} wins the series ${l}-${w} and advances.`;
  if (w === l) return `The series is tied ${w}-${l}.`;
  return w > l ? `${schoolName} leads the series ${w}-${l}.` : `${opponentName || 'The opponent'} leads the series ${l}-${w}.`;
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

function Slide({ index, slide, me, week, onTap }: { index: Index; slide: RoundSlide; me: number; week: number; onTap: () => void }) {
  const schoolName = shortName(index.schools[me]?.[0] || '');
  // The week's stories, newest first, then round and round.
  const list = slide.stories[week] || [];
  const live = slide.cards.find((c) => c.week === week)?.state === 'live';
  const [turn, setTurn] = useState({ key: '', i: 0 });
  const listKey = `${week}:${list.length}`;
  const i = turn.key === listKey ? turn.i : Math.max(0, list.length - 1);
  useEffect(() => {
    if (list.length < 2) return;
    const t = window.setTimeout(() => setTurn({ key: listKey, i: (i + 1) % list.length }), live ? LIVE_STORY_MS : FINAL_STORY_MS);
    return () => window.clearTimeout(t);
  }, [i, listKey, list.length, live]);
  const day: Story | undefined = list[i];
  const title = day?.title || slide.title;
  const summary = day?.summary || slide.summary;
  const wonRound = slide.complete && slide.wins >= 2;
  const seriesLabel = slide.done.length ? `${schoolName} ${wonRound ? 'Wins' : slide.complete ? 'Finishes' : 'Leads'} (${slide.wins}-${slide.losses})` : 'Series not started';
  const oppLabel = slide.opponent ? shortName(index.schools[slide.opponent]?.[0] || 'Opponent') : 'Opponent';
  const series = seriesStatus(slide, schoolName, oppLabel);
  const status = day ? `${series} · ${day.label}` : series;

  return (
    <div className="yft-slide" role="button" tabIndex={0} onClick={onTap}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } }}
      aria-label={`Round ${slide.round}. ${seriesLabel}`}>
      {slide.opponent ? <Fallback className="yft-ghost" srcs={[getSchoolCrestUrl(slide.opponent), CREST_FALLBACK_PATH]} alt="" /> : null}
      {day?.hero
        ? <Fallback key={day.hero.id} className="yft-person" srcs={currentPlayerImages(day.hero.id)} alt={day.hero.name} />
        : slide.heroStar
        ? <Fallback className="yft-person" srcs={currentPlayerImages(slide.heroStar[5], slide.heroIdentity?.headshotUrl)} alt={slide.heroStar[0]} />
        : <Fallback className="yft-person" srcs={[YATI_HEROES[(slide.round || 1) % YATI_HEROES.length]]} alt="YaTi" />}

      <div className="yft-story yft-fade" key={`${listKey}:${i}`}>
        <span className="yft-status">{status}</span>
        <strong className={`yft-title${title.length > 20 ? ' long' : ''}`}>{title}</strong>
        <p>{summary}</p>
        {list.length > 1 ? <span className="yft-dots" aria-hidden="true">{list.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</span> : null}
        {day?.shouts.length ? (
          <span className="yft-shouts">
            {day.shouts.map((x) => (
              <a key={x.kind} className="yft-star" href={`/${me}/player/${encodeURIComponent(x.id)}`} onClick={(e) => e.stopPropagation()}
                title={`${x.name}: ${x.line}`}>
                ★ {x.kind === 'bat' ? 'Top OPS+' : 'Top FIP-'} {x.name} {x.value} <span>({x.line})</span>
              </a>
            ))}
          </span>
        ) : !day && slide.heroStar ? (
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
            const matchupKnown = Boolean(opp);
            return (
              <div key={card.week} className="yft-series-game">
                <small>G{i + 1}</small>
                <span>{score || matchupKnown ? <span className="yft-scorelines">
                    <span className="yft-scoreline"><b>{oppName}</b><i>{score ? score[1] : ''}</i></span>
                    <span className="yft-scoreline home"><b>{schoolName}</b><i>{score ? score[0] : ''}</i></span>
                  </span> : <>Week {card.week}<br /><em>TBD</em></>}</span>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

type PostStory = { headline:string; summary:string };

function postStory(index:Index, games:GameRow[], boxes:Record<string,GameBox>):PostStory | null {
  type Perf = { p:PlayerRow; school:string };
  const rows:Perf[] = [];
  for (const g of games) {
    const box=boxes[String(g[0])];
    if(!box) continue;
    for(const p of box.h?.p||[]) rows.push({p,school:shortName(index.schools[g[2]]?.[0]||'')});
    for(const p of box.a?.p||[]) rows.push({p,school:shortName(index.schools[g[3]]?.[0]||'')});
  }
  const hitters=rows.filter((x)=>Array.isArray(x.p[4])&&Number((x.p[4] as number[])[0]||0)>0&&Number.isFinite(Number(x.p[6])))
    .sort((a,b)=>Number(b.p[6])-Number(a.p[6]));
  const pitchers=rows.filter((x)=>Array.isArray(x.p[5])&&Number.isFinite(Number(x.p[7]))&&((x.p[5] as number[]).slice(0,5).some((v)=>Number(v||0)>0)))
    .sort((a,b)=>Number(a.p[7])-Number(b.p[7]));
  const h=hitters[0], p=pitchers[0];
  if(!h&&!p)return null;
  const hEdge=h?Number(h.p[6])-100:-Infinity;
  const pEdge=p?100-Number(p.p[7]):-Infinity;
  const lead=hEdge>=pEdge?h:p;
  const surname=(lead?.p[1]||'').trim().split(/\s+/).pop()?.toUpperCase()||'POSTSEASON';
  const headline=lead===p?`${surname} DEALS`:`${surname} POWERS THE WEEK`;
  const parts:string[]=[];
  if(h)parts.push(`${h.p[1]} (${h.school}) posted the week's top OPS+ at ${Math.round(Number(h.p[6]))}`);
  if(p)parts.push(`${p.p[1]} (${p.school}) led the pitching side at ${Math.round(Number(p.p[7]))} FIP-`);
  return {headline,summary:parts.join('. ')+'.'};
}

function PostSlide({ index, games, week, label, title, showScores, championName, onTap }: {
  index:Index; games:GameRow[]; week:number; label:string; title:string; showScores:boolean; championName:string; onTap:()=>void;
}) {
  const [story,setStory]=useState<PostStory|null>(null);
  useEffect(()=>{
    let cancelled=false;
    if(!games.length){setStory(null);return()=>{cancelled=true;};}
    const file=week===34?'d-gf':'d-lbt';
    loadBoxes(file).then((boxes)=>{if(!cancelled)setStory(postStory(index,games,boxes));}).catch(()=>{});
    return()=>{cancelled=true;};
  },[games,index,week]);
  const status=week===31 ? `BRACKET CHAMPION · ${championName}` : games.length ? 'TOURNAMENT SCOREBOARD' : 'UPCOMING';
  return (
    <div className="yft-slide yft-post-slide" role="button" tabIndex={0} onClick={onTap}
      onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onTap();}}}
      aria-label={title}>
      <div className="yft-story">
        <span className="yft-status">{status}</span>
        <strong className="yft-title">{story?.headline || title}</strong>
        <p>{story?.summary || (games.length ? 'Every fan can follow the complete field here.' : 'This stage is set when the prior stage is complete.')}</p>
      </div>
      <aside className="yft-series yft-post-scores" aria-label={`${title} scores`}>
        <div className="yft-series-games">
          {games.length ? games.map((g,i)=>{
            const [hr,ar]=runsOf(g[5]);
            const away=shortName(index.schools[g[3]]?.[0]||'Away');
            const home=shortName(index.schools[g[2]]?.[0]||'Home');
            return (
              <div className="yft-series-game" key={g[0]}>
                <small>G{i+1}</small>
                <span className="yft-scorelines">
                  <span className="yft-scoreline"><b>{away}</b><i>{showScores ? ar : ''}</i></span>
                  <span className="yft-scoreline home"><b>{home}</b><i>{showScores ? hr : ''}</i></span>
                </span>
              </div>
            );
          }) : (
            <div className="yft-series-game"><small>{label}</small><span>TBD<br/><em>Awaiting field</em></span></div>
          )}
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
  const [boxes, setBoxes] = useState<Record<string, Record<string, GameBox>>>({});
  const [active, setActive] = useState(0);
  // The week picked on each round's slide (round -> week); unset = its default.
  const [weekSel, setWeekSel] = useState<Record<number, number>>({});
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadIndex(), loadLb()]).then(([index, lb]) => { if (!cancelled) setData({ index, lb, asof: previewDate() }); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const cards = useMemo(() => (data ? schoolSeason(data.index, data.lb, me, data.asof) : []), [data, me]);
  const cal = useMemo(() => (data ? calendar(data.index, data.asof) : null), [data]);
  const region = data?.index.schools[me]?.[1];

  useEffect(() => {
    if (!region) return;
    let cancelled = false;
    loadStars(region).then((all) => { if (!cancelled) setStars(all[me] || {}); });
    return () => { cancelled = true; };
  }, [region, me]);

  // The box scores of the weeks under way or played (the daily stories).
  const boxFiles = useMemo(() => [...new Set(cards.filter((c) => c.game && c.file && c.days > 0).map((c) => c.file!))].join(','), [cards]);
  useEffect(() => {
    if (!boxFiles) return;
    let cancelled = false;
    const files = boxFiles.split(',');
    Promise.all(files.map((f) => loadBoxes(f).catch(() => ({} as Record<string, GameBox>))))
      .then((all) => { if (!cancelled) setBoxes(Object.fromEntries(files.map((f, i) => [f, all[i]]))); });
    return () => { cancelled = true; };
  }, [boxFiles]);

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
      // Every week's stories. The slide opens on the week the page leads
      // with (Monday morning: last week's final), else the latest with news.
      const lead = cal ? leadWeek(cards, cal.week) : 0;
      const schoolName = shortName(data.index.schools[me]?.[0] || '');
      const oppName = opponent ? shortName(data.index.schools[opponent]?.[0] || '') : '';
      const stories: Record<number, Story[]> = {};
      list.forEach((c, k) => {
        if (!c.game || !c.file || !c.days || c.week > Math.max(lead, firstWeek)) return;
        // The series as it stood after this game, for its recap.
        const upTo = done.filter((x) => x.week <= c.week);
        const after = { done: upTo, wins: upTo.filter((x) => x.game?.[6] === me).length, losses: upTo.filter((x) => x.game?.[6] != null && x.game?.[6] !== me).length, complete: upTo.length === 3 };
        const box = boxes[c.file]?.[String(c.game[0])];
        stories[c.week] = weekStories(data.index, c.game, box, me, k + 1, seriesSentence(after, schoolName, oppName), c.state === 'final')
          .map((x) => ({ ...x, label: `Game ${k + 1} · ${x.day}` }));
      });
      const withNews = list.filter((c) => stories[c.week]?.length).map((c) => c.week);
      const defaultWeek = lead >= firstWeek && lead <= lastWeek ? lead : withNews[withNews.length - 1] || firstWeek;
      const latest = stories[defaultWeek] || [];
      const day = latest[latest.length - 1];
      return {
        ...base,
        stories,
        defaultWeek,
        title: day?.title || starHeadline(heroStar, round, done.length, wins, losses),
        summary: day?.summary || buildSummary(data.index, base, me, stars),
        heroIdentity: heroStar ? identities[heroStar[5]] : undefined,
      };
    });
  }, [boxes, cal, cards, data, identities, me, stars]);

  const go = useCallback((i: number, smooth = true) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const nav=useBracketNav();
  const stageKeys:FantasyStageKey[]=[...FANTASY_STAGE_KEYS];
  const postStages=[
    {key:'c1',label:'QUARTERFINALS',title:'CHAMPIONSHIP QUARTERFINALS',week:31},
    {key:'c2',label:'SEMIFINALS',title:'CHAMPIONSHIP SEMIFINALS',week:32},
    {key:'cg',label:'CHAMPIONSHIP GAME',title:'CHAMPIONSHIP GAME',week:33},
    {key:'yws',label:'YAT?STATS WORLD SERIES',title:'YAT?STATS WORLD SERIES',week:34},
  ] as const;

  useEffect(()=>{
    if(!rounds.length)return;
    const initial:FantasyStageKey=nav.stageKey||stageKeyForWeek(Math.max(1,Math.min(34,cal?leadWeek(cards,cal.week):1)));
    const i=Math.max(0,stageKeys.indexOf(initial));
    requestAnimationFrame(()=>{go(i,false);setActive(i);if(!nav.stageKey)selectStage(initial);});
  },[rounds.length,cal?.week,go]);

  // A game picked on the scoreboard shows that week's stories here too.
  useEffect(()=>{
    const w=nav.focusWeek;
    if(!nav.focusSeq||!w||w>30)return;
    setWeekSel((x)=>({...x,[Math.ceil(w/3)]:w}));
  },[nav.focusSeq,nav.focusWeek]);

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

  if (!data || !rounds.length) return <section className="yft-hero" aria-label="The season, round by round"><BallparkScene /></section>;

  return (
    <section className="yft-hero" aria-label="The season, round by round">
      <BallparkScene />
      <div className="yft-track" ref={trackRef} onScroll={onScroll}>
        {rounds.map((r)=>{
          const focus=r.cards.find(c=>c.week===(cal?leadWeek(cards,cal.week):0))||[...r.done].reverse()[0]||r.cards[0];
          const key=`r${r.round}` as FantasyStageKey;
          const week=weekSel[r.round]??r.defaultWeek;
          return <Slide key={key} index={data.index} slide={r} me={me} week={week} onTap={()=>{selectStage(key);focusWeek(week||focus?.week||r.firstWeek);}}/>;
        })}
        {postStages.map((s)=>{
          const stageKnown=(cal?.final||0)>=s.week-1;
          const stageIsFinal=s.week<=(cal?.final||0);
          const gamesForStage=!stageKnown ? [] : s.key==='yws'
            ? data.index.gf.filter((g)=>g[1]===s.week)
            : data.index.lbt.filter((x)=>x.game[1]===s.week).map((x)=>x.game);
          const championName=(cal?.final||0)>=30 ? shortName(data.index.schools[data.index.champion]?.[0]||'_______________') : '_______________';
          return <PostSlide key={s.key} index={data.index} games={gamesForStage} week={s.week} label={s.label} title={s.title} showScores={stageIsFinal} championName={championName}
            onTap={()=>{selectStage(s.key);focusWeek(s.week);}}/>;
        })}
      </div>

      <button type="button" className="yft-nav prev" onClick={()=>{const i=Math.max(0,active-1);selectStage(stageKeys[i]);go(i);}} disabled={active===0} aria-label="Previous stage">‹</button>
      <button type="button" className="yft-nav next" onClick={()=>{const i=Math.min(stageKeys.length-1,active+1);selectStage(stageKeys[i]);go(i);}} disabled={active===stageKeys.length-1} aria-label="Next stage">›</button>

      <div className="yft-rail" aria-label="Season timeline">
        <span className="yft-rail-track" aria-hidden="true"/>
        {Array.from({length:34},(_,k)=>{
          // One dot per week: big where a round or postseason stage starts
          // (R1 = week 1, R2 = week 4 ...), small for a round's 2nd and 3rd.
          const w=k+1;
          const i=w<=30?Math.ceil(w/3)-1:10+(w-31);
          const key=stageKeys[i];
          const big=w>30||(w-1)%3===0;
          const label=i<10?`R${i+1}`:i===10?'C1':i===11?'C2':i===12?'CG':'YWS';
          const r=i<10?rounds[i]:null;
          const picked=i===active&&(!r||(weekSel[r.round]??r.defaultWeek)===w);
          const cls=`${big?'':' wk'}${big&&r?.complete&&r.wins>=2?' W':big&&r?.complete&&r.losses>=2?' L':''}${picked?' on':''}${w===(cal?.week||0)?' now':''}`;
          return <button key={w} type="button" className={`yft-tick${cls}`} style={{left:`${(k/33)*100}%`}}
            onClick={()=>{selectStage(key);go(i);if(r)setWeekSel((x)=>({...x,[r.round]:w}));focusWeek(w);}} aria-label={`Week ${w}`}>{big?<span className="yft-tick-label">{label}</span>:null}</button>;
        })}
      </div>
      <style jsx global>{`
        /* Keep Fantasy in the exact player-profile Career Path Timeline box.
           We are swapping content, not changing the page geometry. */
        .yat-row3-shell:has(.yft-hero) { height:200px !important; min-height:200px !important; overflow:hidden !important; }
        .yft-hero { position:relative; height:200px; min-height:200px; overflow:hidden; background:transparent; color:#fff; border-bottom:1px solid rgba(255,255,255,.08); }
        .yft-track { display:flex; height:100%; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none; overscroll-behavior-x:contain; }
        .yft-track::-webkit-scrollbar { display:none; }
        .yft-slide { position:relative; flex:0 0 100%; height:100%; scroll-snap-align:start; overflow:hidden; cursor:pointer; }
        .yft-ghost { position:absolute; left:3%; top:50%; width:33%; height:92%; transform:translateY(-50%); opacity:.09; object-fit:contain; pointer-events:none; }
        /* The ballpark behind the slides (BallparkScene): a night game in the
           dark theme (one light tower, its lamps in row 1), a day game in
           the light one, as one picture behind rows 1, 2 and 3 - the way
           the player profile's photo bleeds up behind the header. Its shade
           darkens both sides top to bottom and lets the center light
           through; every word gets a dark outline so it reads over the glow
           too. */
        .yft-track { position:relative; z-index:1; }
        /* Rows 1 and 2 go see-through over it on the Fantasy tab (only it
           has .yft-hero), and keep their light icons, logo and school name
           in the light theme too: the sky behind them is dark or deep blue,
           never the theme's white. Same pins as the profile's .pp-hero-row
           (ZoomableCareerTimeline). */
        body:has(.yft-hero) .yat-row1-shell, body:has(.yft-hero) .yat-row1-shell .yat-topbar,
        body:has(.yft-hero) .yat-row2-shell, body:has(.yft-hero) .yat-row2-shell .yat-schoolrow { background:transparent !important; }
        body:has(.yft-hero) .yat-row2-shell { border-color:transparent !important; }
        body:has(.yft-hero) .yat-row1-shell { --fg:#f2f2f2; --logo-filter:invert(1); }
        body:has(.yft-hero) .yat-row2-shell { --fg:#f2f2f2; --muted:#c4c4c4; }
        body:has(.yft-hero) .yat-row2-shell .yat-schooltext .big1, body:has(.yft-hero) .yat-row2-shell .yat-schooltext .big2 { color:var(--fg); }
        body:has(.yft-hero) .yat-topnav-item, body:has(.yft-hero) .yat-schooltext { text-shadow:0 0 2px #000,0 0 3px #000; }
        .yft-status, .yft-story p, .yft-star, .yft-series { text-shadow:0 0 2px #000,0 0 3px #000,0 1px 3px rgba(0,0,0,.9); }
        .yft-title { -webkit-text-stroke:1px #000; paint-order:stroke fill; text-shadow:0 0 3px #000,0 2px 4px rgba(0,0,0,.9); }
        .yft-person { position:absolute; z-index:1; left:64%; bottom:30px; width:18%; height:calc(100% - 38px); object-fit:contain; object-position:bottom center; pointer-events:none; }
        .yft-left-meta { position:absolute; left:2.5%; top:12px; z-index:2; display:flex; flex-direction:column; gap:2px; color:#fff; }
        .yft-left-meta b { font:700 16px/1 Oswald,sans-serif; }
        .yft-left-meta.yft-post-corner b { display:flex; flex-direction:column; gap:1px; font-size:15px; line-height:.98; }
        .yft-left-meta.yft-post-corner b span:first-child { text-transform:none; }
        .yft-left-meta span { font:500 10px/1.1 system-ui,sans-serif; color:rgba(255,255,255,.78); }
        .yft-story { position:absolute; z-index:2; left:5%; right:36%; top:8px; bottom:40px; display:flex; flex-direction:column; justify-content:center; min-width:0; padding:0 14px; }
        .yft-dates { color:rgba(255,255,255,.82); font:500 12px/1.2 system-ui,sans-serif; }
        .yft-status { color:rgba(255,255,255,.86); font:700 13px/1 Oswald,sans-serif; letter-spacing:.03em; text-transform:uppercase; }
        .yft-title { margin:7px 0 5px; color:#fff; font:700 clamp(26px,3.5vw,42px)/.95 Oswald,sans-serif; letter-spacing:.01em; text-transform:uppercase; }
        .yft-story p { margin:0; max-width:780px; color:rgba(255,255,255,.94); font:400 13px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace; }
        .yft-title.long { font-size:clamp(22px,2.6vw,34px); }
        .yft-shouts { display:flex; flex-wrap:wrap; column-gap:14px; row-gap:2px; margin-top:6px; }
        .yft-shouts .yft-star { margin-top:0; white-space:nowrap; }
        .yft-shouts .yft-star span { color:rgba(255,255,255,.62); text-transform:none; }
        .yft-star { margin-top:8px; color:var(--gold,#d5b44a); font:600 10px/1.2 Oswald,sans-serif; letter-spacing:.06em; text-decoration:none; text-transform:uppercase; }
        .yft-series { position:absolute; z-index:2; right:1.2%; top:8px; bottom:40px; width:16%; min-width:150px; display:flex; flex-direction:column; align-items:stretch; justify-content:center; text-align:left; }
        .yft-series>b { color:#fff; font:700 22px/1 Oswald,sans-serif; }
        .yft-series>span { margin-top:4px; color:rgba(255,255,255,.85); font:600 11px/1.2 Oswald,sans-serif; }
        .yft-series-games { margin-top:0; width:100%; display:grid; gap:9px; }
        .yft-series-game { display:grid; grid-template-columns:auto minmax(0,1fr); gap:5px; align-items:center; color:rgba(255,255,255,.78); font:500 11.5px/1.18 Oswald,sans-serif; }
        .yft-series-game small { color:var(--gold,#d5b44a); font:700 9px/1 Oswald,sans-serif; text-align:left; padding:0; }
        .yft-series-game em { color:#fff; font-style:normal; font-weight:700; }
        .yft-scorelines { display:grid; gap:1px; min-width:0; }
        .yft-scoreline { display:grid; grid-template-columns:minmax(0,1fr) 22px; column-gap:10px; align-items:baseline; min-width:0; }
        .yft-scoreline b { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:rgba(255,255,255,.78); font-weight:500; }
        .yft-scoreline.home b { color:#fff; font-weight:700; }
        .yft-scoreline i { font-style:normal; text-align:right; color:#fff; font-variant-numeric:tabular-nums; }
        .yft-raffle-cta { position:absolute; z-index:6; left:2.5%; top:calc((100% - 32px) / 2); bottom:auto; transform:translateY(-50%); width:150px; height:104px; display:block; padding:0; border:0; background:transparent; color:#fff; cursor:pointer; text-align:left; }
        .yft-raffle-trophy { position:absolute; left:0; bottom:0; width:92px; height:104px; flex:none; object-fit:contain; object-position:left bottom; filter:drop-shadow(0 5px 7px rgba(0,0,0,.55)); transform:none; transform-origin:left bottom; }
        .yft-raffle-note { position:absolute; left:38px; bottom:5px; z-index:1; width:104px; color:#fff; font-family:Arial Black,Arial,Helvetica,sans-serif; font-weight:900; font-size:14px; line-height:.92; letter-spacing:-.045em; text-align:left; -webkit-text-stroke:.8px #000; paint-order:stroke fill; text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 2px 3px rgba(0,0,0,.85); transform:none; }
        .yft-raffle-note strong { color:#fff; font-weight:900; }
        .yft-raffle-cta:hover .yft-raffle-trophy,.yft-raffle-cta:focus-visible .yft-raffle-trophy { filter:drop-shadow(0 7px 10px rgba(0,0,0,.7)) drop-shadow(0 0 3px rgba(213,180,74,.6)); }
        .yft-raffle-cta:focus-visible { outline:none; }
        .yft-nav { position:absolute; top:50%; transform:translateY(-50%); width:30px; height:46px; border:0; background:rgba(0,0,0,.35); color:#fff; font-size:26px; line-height:1; cursor:pointer; z-index:7; }
        .yft-nav:disabled { opacity:.2; cursor:default; }
        .yft-nav.prev { left:0; }
        .yft-nav.next { right:0; }
        .yft-rail { position:absolute; left:3%; right:3%; bottom:4px; height:34px; z-index:7; }
        .yft-rail-track { position:absolute; left:0; right:0; top:8px; height:2px; background:rgba(255,255,255,.18); }
        .yft-tick { position:absolute; top:1px; width:14px; height:14px; margin-left:-7px; padding:0; border:0; background:transparent; cursor:pointer; }
        .yft-tick:disabled { cursor:default; }
        .yft-tick::before { content:''; position:absolute; left:4px; top:3px; width:6px; height:8px; border-radius:1px; background:rgba(255,255,255,.42); }
        .yft-tick.W::before { background:#78c988; }
        .yft-tick.L::before { background:#d46f66; }
        .yft-tick.on::before,.yft-tick.now::before { box-shadow:0 0 0 2px rgba(213,180,74,.72); }
        .yft-tick.wk { width:10px; margin-left:-5px; }
        .yft-tick.wk::before { left:3px; top:5px; width:4px; height:4px; border-radius:50%; background:rgba(255,255,255,.38); }
        .yft-tick.wk.on::before, .yft-tick.wk.now::before { background:#d5b44a; box-shadow:0 0 0 2px rgba(213,180,74,.45); }
        .yft-fade { animation:yft-fade .7s ease-out; }
        @keyframes yft-fade { from { opacity:0; } }
        @media (prefers-reduced-motion: reduce) { .yft-fade { animation:none; } }
        .yft-dots { display:flex; gap:4px; margin-top:6px; }
        .yft-dots i { width:5px; height:5px; border-radius:50%; background:rgba(255,255,255,.3); }
        .yft-dots i.on { background:#d5b44a; }
        .yft-tick-label { position:absolute; left:50%; top:16px; transform:translateX(-50%); color:rgba(255,255,255,.62); font:700 13px/1 Oswald,sans-serif; letter-spacing:.02em; white-space:nowrap; }
        .yft-tick:hover .yft-tick-label { color:#fff; }
        .yft-tick.on .yft-tick-label { color:#d5b44a; }

        @media (max-width:760px) {
          body:has(.yft-hero) { --row3-h:118px; }
          .yat-row3-shell:has(.yft-hero) { height:118px !important; min-height:118px !important; }
          .yft-hero { height:118px; min-height:118px; }
          .yft-person { left:58%; width:18%; height:calc(100% - 23px); bottom:19px; object-position:bottom center; }
          .yft-ghost { left:0; width:31%; }
          .yft-left-meta { left:2.5%; top:5px; gap:1px; }
          .yft-left-meta b { font-size:10px; }
          .yft-left-meta span { font-size:6px; }
          .yft-story { left:5%; right:42%; top:4px; bottom:27px; padding:0 4px; justify-content:center; }
          .yft-status { font-size:6.5px; line-height:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .yft-title { margin:2px 0 2px; font-size:16px; line-height:.94; }
          .yft-title.long { font-size:13px; }
          .yft-shouts { margin-top:2px; column-gap:6px; row-gap:1px; }
          .yft-shouts .yft-star span { display:none; }
          .yft-story:has(.yft-shouts) p { -webkit-line-clamp:4; }
          .yft-story p { font-size:7px; line-height:1.14; display:-webkit-box; -webkit-line-clamp:5; -webkit-box-orient:vertical; overflow:hidden; }
          .yft-dots { gap:3px; margin-top:2px; }
          .yft-dots i { width:3px; height:3px; }
          .yft-tick.wk { width:8px; margin-left:-4px; }
          .yft-tick.wk::before { left:2px; top:5px; width:3px; height:3px; }
          .yft-star { margin-top:2px; font-size:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .yft-series { right:1%; top:4px; bottom:27px; width:21%; min-width:0; justify-content:center; }
          .yft-series-games { margin-top:0; gap:5px; }
          .yft-series-game { grid-template-columns:auto minmax(0,1fr); gap:3px; font-size:8.2px; line-height:1.10; }
          .yft-scoreline { grid-template-columns:minmax(0,1fr) 14px; column-gap:6px; }
          .yft-post-scores .yft-series-games { gap:4px; }
          .yft-post-scores .yft-series-game { font-size:7.2px; line-height:1.08; }
          .yft-series-game small { font-size:6.4px; line-height:1; text-align:left; padding:0; }
          .yft-raffle-cta { left:2.5%; top:calc((100% - 23px) / 2); bottom:auto; width:112px; height:78px; transform:translateY(-50%); }
          .yft-raffle-trophy { left:0; bottom:0; width:67px; height:78px; object-position:left bottom; }
          .yft-raffle-note { left:28px; bottom:4px; width:78px; font-size:10.5px; line-height:.92; letter-spacing:-.045em; -webkit-text-stroke:.6px #000; }
          .yft-nav { display:none; }
          .yft-rail { left:4%; right:4%; bottom:1px; height:24px; }
          .yft-rail-track { top:6px; height:1px; }
          .yft-tick { width:10px; height:10px; margin-left:-5px; top:1px; }
          .yft-tick::before { left:3px; top:2px; width:4px; height:6px; }
          .yft-tick-label { display:block; top:11px; font-size:9px; letter-spacing:0; color:rgba(255,255,255,.62); }
        }
      `}</style>
    </section>
  );
}
