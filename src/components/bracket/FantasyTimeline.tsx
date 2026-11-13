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
import { type DayShout, type DayStory, weekHero, weekStories } from './dayStory';
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
  defaultWeek: number; // the week the slide's title/summary lead with
  startWeek: number; // the week playback starts on: the round's first game with stories
};

type Story = DayStory & { label: string };
// How long each story shows before dissolving into the next (Pete, Nov 13:
// twice as long, so a story can be read before it changes): a game in
// progress 20s, a finished one 12s.
const LIVE_STORY_MS = 20_000;
const FINAL_STORY_MS = 12_000;

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

function buildSummary(index: Index, slide: Omit<RoundSlide, 'summary' | 'title' | 'heroIdentity' | 'stories' | 'defaultWeek' | 'startWeek'>, me: number, stars: Record<number, Star>) {
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

// A school's name for the hero's series column, at most 10 characters (what
// fits beside the hero in Pete's mock): the short name if it fits; else with
// the usual short forms (Abp., Mt., St. ...); else its leading words and the
// initials of the rest ("Belen Jesuit Prep" -> "Belen JP"), or just the
// leading words if even the initials won't fit.
const SERIES_NAME_MAX = 10;
const SHORT_FORMS: [RegExp, string][] = [
  [/\s+(High\s+)?School$/i, ''], [/\bCountry Day\b/g, 'CD'], [/\bArchbishop\b/g, 'Abp.'], [/\bSaint\b/g, 'St.'],
  [/\bMount\b/g, 'Mt.'], [/\bFort\b/g, 'Ft.'], [/\bCardinal\b/g, 'Card.'], [/\bCatholic\b/g, 'Cath.'], [/\bAcademy\b/g, 'Acad.'],
];
export function seriesName(name: string) {
  if (name.length <= SERIES_NAME_MAX) return name;
  const short = SHORT_FORMS.reduce((n, [re, to]) => n.replace(re, to), name).trim();
  if (short.length <= SERIES_NAME_MAX) return short;
  const words = short.split(/\s+/);
  for (let k = words.length - 1; k >= 1; k--) {
    const initials = words.slice(k).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join('');
    const withInitials = `${words.slice(0, k).join(' ')}${initials ? ` ${initials}` : ''}`;
    if (withInitials.length <= SERIES_NAME_MAX) return withInitials;
  }
  const first = words[0];
  if (first.length <= SERIES_NAME_MAX) return first;
  // One word still too long: a hyphenated name goes to its initials
  // ("Homewood-Flossmoor" -> "H-F"), anything else is cut with a period.
  const parts = first.split('-').filter(Boolean);
  if (parts.length > 1) return parts.map((w) => w[0]).join('-');
  return `${first.slice(0, SERIES_NAME_MAX - 1)}.`;
}

// The series line over the hero's games: "Barbe Leads Series 1-0",
// "Series Tied 1-1", "Belen JP Wins Series 2-1".
function seriesHeadline(wins: [number, number], names: [string, string]) {
  const [a, b] = wins;
  if (!a && !b) return 'Series 0-0';
  if (a === b) return `Series Tied ${a}-${b}`;
  const [lead, w, l] = a > b ? [names[0], a, b] : [names[1], b, a];
  return `${lead} ${w >= 2 ? 'Wins' : 'Leads'} Series ${w}-${l}`;
}

// One game of a series column: visitors over home, each name right-justified
// with its score in a column beside it, and the game number in red to the
// right, between the two lines. A final's winner - name and runs - in gold.
function SeriesGame({ n, away, home, runs, winner }: {
  n: number; away: string; home: string; runs: number[] | null; winner: 'away' | 'home' | null;
}) {
  return (
    <div className="yft-series-game">
      <span className={`yft-sl-name${winner === 'away' ? ' win' : ''}`}>{away}</span>
      <span className={`yft-sl-runs${winner === 'away' ? ' win' : ''}`}>{runs ? runs[1] : ''}</span>
      <small className="yft-sl-game">G{n}</small>
      <span className={`yft-sl-name${winner === 'home' ? ' win' : ''}`}>{home}</span>
      <span className={`yft-sl-runs${winner === 'home' ? ' win' : ''}`}>{runs ? runs[0] : ''}</span>
    </div>
  );
}

function Slide({ index, slide, me, week, onTap, playing, onWeekEnd }: {
  index: Index; slide: RoundSlide; me: number; week: number; onTap: () => void;
  // Only the slide on screen plays. At the end of a week's stories the
  // timeline picks what comes next (see onWeekEnd there); the week it returns
  // replays from its first story when it is this same week.
  playing: boolean; onWeekEnd: () => number;
}) {
  const schoolName = shortName(index.schools[me]?.[0] || '');
  // The week's stories in order: Game N's innings, then its final.
  const list = slide.stories[week] || [];
  const live = slide.cards.find((c) => c.week === week)?.state === 'live';
  const [turn, setTurn] = useState({ key: '', i: 0 });
  const listKey = `${week}:${list.length}`;
  const i = turn.key === listKey ? Math.min(turn.i, Math.max(0, list.length - 1)) : 0;
  useEffect(() => {
    if (!playing || !list.length) return;
    const t = window.setTimeout(() => {
      if (i + 1 < list.length) { setTurn({ key: listKey, i: i + 1 }); return; }
      // Last story of this game: on to the next game (or back to the round's first).
      if (onWeekEnd() === week) setTurn({ key: listKey, i: 0 });
    }, live ? LIVE_STORY_MS : FINAL_STORY_MS);
    return () => window.clearTimeout(t);
  }, [i, listKey, list.length, live, playing, onWeekEnd, week]);
  const day: Story | undefined = list[i];
  const title = day?.title || slide.title;
  const summary = day?.summary || slide.summary;
  const wonRound = slide.complete && slide.wins >= 2;
  const seriesLabel = slide.done.length ? `${schoolName} ${wonRound ? 'Wins' : slide.complete ? 'Finishes' : 'Leads'} (${slide.wins}-${slide.losses})` : 'Series not started';
  const oppLabel = slide.opponent ? shortName(index.schools[slide.opponent]?.[0] || 'Opponent') : 'Opponent';
  const series = seriesStatus(slide, schoolName, oppLabel);
  const status = day ? `${series} · ${day.label}` : series;
  // Each game, visitors over home as on the scoreboard: a game not yet
  // drawn takes the series' home from its other games.
  const homeGame = slide.cards.find((c) => c.game)?.game;
  const myName = seriesName(schoolName);
  const games = slide.cards.map((card) => {
    const opp = card.game ? (card.game[2] === me ? card.game[3] : card.game[2]) : slide.opponent;
    const oppName = opp ? seriesName(shortName(index.schools[opp]?.[0] || 'Opponent')) : 'TBD';
    const meHome = (card.game || homeGame) ? (card.game || homeGame)![2] === me : true;
    const final = card.state === 'final' && card.game ? card.game : null;
    return {
      card, matchupKnown: Boolean(opp),
      away: meHome ? oppName : myName, home: meHome ? myName : oppName,
      runs: final ? runsOf(final[5]) : null,
      winner: final && final[6] ? (final[6] === final[2] ? 'home' : 'away') as 'home' | 'away' : null,
    };
  });
  const oppShort = slide.opponent ? seriesName(oppLabel) : 'Opponent';
  const headline = seriesHeadline([slide.wins, slide.losses], [myName, oppShort]);

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

      <aside className="yft-series" aria-label={`Round ${slide.round} series`}
        style={{ '--yft-name-ch': Math.max(...games.flatMap((x) => [x.away.length, x.home.length])) } as React.CSSProperties}>
        <span className="yft-series-line">{headline}</span>
        <div className="yft-series-games">
          {games.map(({ card, matchupKnown, away, home, runs, winner }, i) => (matchupKnown
            ? <SeriesGame key={card.week} n={i + 1} away={away} home={home} runs={runs} winner={winner} />
            : <SeriesGame key={card.week} n={i + 1} away={`Week ${card.week}`} home="TBD" runs={null} winner={null} />))}
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
      <aside className="yft-series yft-post-scores" aria-label={`${title} scores`}
        style={{ '--yft-name-ch': Math.max(label.length, ...games.flatMap((g) => [g[2], g[3]].map((h) => seriesName(shortName(index.schools[h]?.[0] || 'Home')).length))) } as React.CSSProperties}>
        <div className="yft-series-games">
          {games.length ? games.map((g,i)=>(
            <SeriesGame key={g[0]} n={i+1}
              away={seriesName(shortName(index.schools[g[3]]?.[0]||'Away'))} home={seriesName(shortName(index.schools[g[2]]?.[0]||'Home'))}
              runs={showScores ? runsOf(g[5]) : null}
              winner={showScores && g[6] ? (g[6] === g[2] ? 'home' : 'away') : null} />
          )) : (
            <SeriesGame n={1} away={label} home="Awaiting field" runs={null} winner={null} />
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
    // The picture for a story with no shout-out of its own (Pete: the guys
    // who played well, not YaTi): the school's best line of that week, else
    // its latest best before it, else the opponent's best that week. YaTi
    // only when nobody in the game has played.
    const pictures: Record<number, DayShout | undefined> = {};
    let latest: DayShout | undefined;
    for (const c of [...cards].sort((a, b) => a.week - b.week)) {
      if (!c.game || !c.file) continue;
      const box = boxes[c.file]?.[String(c.game[0])];
      const mine = weekHero(c.game, box, me);
      latest = mine || latest;
      pictures[c.week] = latest || weekHero(c.game, box, c.game[2] === me ? c.game[3] : c.game[2]);
    }
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
          .map((x) => ({ ...x, hero: x.hero || pictures[c.week], label: `Game ${k + 1} · ${x.day}` }));
      });
      const withNews = list.filter((c) => stories[c.week]?.length).map((c) => c.week);
      const defaultWeek = lead >= firstWeek && lead <= lastWeek ? lead : withNews[withNews.length - 1] || firstWeek;
      const startWeek = withNews[0] || firstWeek;
      const latest = stories[defaultWeek] || [];
      const day = latest[latest.length - 1];
      return {
        ...base,
        stories,
        defaultWeek,
        startWeek,
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

  // Recap playback (Pete, Nov 13): a round plays its games in order - Game 1
  // inning by inning to its final, then Game 2, then Game 3 - and after the
  // latest game played, starts over at that round's Game 1. It opens on the
  // current round. Picking an earlier round plays forward from there, round
  // after round, up to the current round, which then loops.
  const weekOf = (r: RoundSlide) => weekSel[r.round] ?? r.startWeek;
  const leadNow = cal ? leadWeek(cards, cal.week) : 1;
  const currentRound = Math.max(1, Math.min(10, Math.ceil(Math.max(1, leadNow) / 3)));
  const nextAfter = (r: RoundSlide) => (): number => {
    const played = r.cards.filter((c) => r.stories[c.week]?.length).map((c) => c.week);
    const at = played.indexOf(weekOf(r));
    if (at >= 0 && at < played.length - 1) {
      const w = played[at + 1];
      setWeekSel((x) => ({ ...x, [r.round]: w }));
      return w;
    }
    // The next round to play: skip rounds with no stories (byes, TBD), which
    // would never start a timer, but always stop at the current round.
    const at2 = rounds.indexOf(r);
    const ni = r.round < currentRound ? rounds.findIndex((x, j) => j > at2 && (x.round >= currentRound || x.cards.some((c) => x.stories[c.week]?.length))) : -1;
    const next = ni >= 0 ? rounds[ni] : undefined;
    if (next) {
      const w = next.startWeek;
      setWeekSel((x) => ({ ...x, [next.round]: w }));
      const key = `r${next.round}` as FantasyStageKey;
      const si = stageKeys.indexOf(key);
      selectStage(key); go(si); setActive(si);
      return -1;
    }
    const w = played[0] ?? r.startWeek;
    setWeekSel((x) => ({ ...x, [r.round]: w }));
    return w;
  };

  if (!data || !rounds.length) return <section className="yft-hero" aria-label="The season, round by round"><BallparkScene /></section>;

  return (
    <section className="yft-hero" aria-label="The season, round by round">
      <BallparkScene />
      <div className="yft-track" ref={trackRef} onScroll={onScroll}>
        {rounds.map((r)=>{
          const focus=r.cards.find(c=>c.week===(cal?leadWeek(cards,cal.week):0))||[...r.done].reverse()[0]||r.cards[0];
          const key=`r${r.round}` as FantasyStageKey;
          const week=weekOf(r);
          return <Slide key={key} index={data.index} slide={r} me={me} week={week} playing={stageKeys[active]===key} onWeekEnd={nextAfter(r)}
            onTap={()=>{selectStage(key);focusWeek(week||focus?.week||r.firstWeek);}}/>;
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
          const picked=i===active&&(!r||weekOf(r)===w);
          const cls=`${big?'':' wk'}${big&&r?.complete&&r.wins>=2?' W':big&&r?.complete&&r.losses>=2?' L':''}${picked?' on':''}${w===(cal?.week||0)?' now':''}`;
          return <button key={w} type="button" className={`yft-tick${cls}`} style={{left:`${(k/33)*100}%`}}
            onClick={()=>{selectStage(key);go(i);if(r)setWeekSel((x)=>({...x,[r.round]:w}));focusWeek(w);}} aria-label={`Week ${w}`}>{big?<span className="yft-tick-label">{label}</span>:null}</button>;
        })}
      </div>
      <style jsx global>{`
        /* Keep Fantasy in the exact player-profile Career Path Timeline box.
           We are swapping content, not changing the page geometry. */
        .yat-row3-shell:has(.yft-hero) { height:200px !important; min-height:200px !important; overflow:visible !important; }
        /* --yft-up: rows 1 and 2 (row 2's borders too). The slides reach up
           behind them (see .yft-track), so a slide's picture can rise out of
           row 3 like a card laid over the page; everything else in a slide
           sits that far down, in row 3. */
        .yft-hero { --yft-up:calc(var(--row1-h, 36px) + var(--row2-h, 54px) + 2px); position:relative; height:200px; min-height:200px; overflow:visible; background:transparent; color:#fff; border-bottom:1px solid rgba(255,255,255,.08); }
        .yft-track { display:flex; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none; overscroll-behavior-x:contain; }
        .yft-track::-webkit-scrollbar { display:none; }
        .yft-slide { position:relative; flex:0 0 100%; height:100%; scroll-snap-align:start; overflow:hidden; cursor:pointer; }
        .yft-ghost { position:absolute; left:3%; top:calc(var(--yft-up) + (100% - var(--yft-up)) / 2); width:33%; height:calc((100% - var(--yft-up)) * .92); transform:translateY(-50%); opacity:.09; object-fit:contain; pointer-events:none; }
        /* The ballpark behind the slides (BallparkScene): a night game in the
           dark theme (one light tower, its lamps in row 1), a day game in
           the light one, as one picture behind rows 1, 2 and 3 - the way
           the player profile's photo bleeds up behind the header. Its shade
           darkens both sides top to bottom and lets the center light
           through; every word gets a dark outline so it reads over the glow
           too. */
        /* The track (the slides) runs from the top of the page to the bottom of
           row 3, under rows 1 and 2, which are see-through and stay on top. */
        .yft-track { position:absolute; z-index:1; left:0; right:0; bottom:0; top:calc(-1 * var(--yft-up)); }
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
        /* The slide's picture: a 5x7 card's place (Pete's mockup, Oct 19) from the
           timeline's R6 tick to its R10, just right of row 2's school name and
           just left of the series, from just under row 1 down to the bottom
           of row 3; the timeline prints over it. A cutout or a headshot sits
           on its bottom edge, and dissolves into the bottom of row 3
           instead of ending on a hard line across the timeline (Pete,
           Oct 19). */
        .yft-person { position:absolute; z-index:1; left:calc(3% + 94% * 15 / 33); width:calc(94% * 12 / 33 + 6px); top:calc(var(--row1-h, 36px) + 4px); height:calc(100% - var(--row1-h, 36px) - 4px); object-fit:contain; object-position:bottom center; pointer-events:none;
          --yft-dissolve:linear-gradient(to bottom, #000 calc(100% - 72px), rgba(0,0,0,.35) calc(100% - 28px), transparent calc(100% - 4px));
          -webkit-mask-image:var(--yft-dissolve); mask-image:var(--yft-dissolve); }
        /* A fade to black (deep blue in the day theme) along the bottom of
           row 3, under the timeline and over the slides. */
        .yft-hero::after { content:''; position:absolute; z-index:6; left:0; right:0; bottom:0; height:60px; background:linear-gradient(to bottom, rgba(2,3,8,0), rgba(2,3,8,.85)); pointer-events:none; }
        body.light-theme .yft-hero::after { background:linear-gradient(to bottom, rgba(6,28,58,0), rgba(6,28,58,.8)); }
        .yft-left-meta { position:absolute; left:2.5%; top:12px; z-index:2; display:flex; flex-direction:column; gap:2px; color:#fff; }
        .yft-left-meta b { font:700 16px/1 Oswald,sans-serif; }
        .yft-left-meta.yft-post-corner b { display:flex; flex-direction:column; gap:1px; font-size:15px; line-height:.98; }
        .yft-left-meta.yft-post-corner b span:first-child { text-transform:none; }
        .yft-left-meta span { font:500 10px/1.1 system-ui,sans-serif; color:rgba(255,255,255,.78); }
        /* The story starts at the top of the box (eyebrow, then the headline,
           then the story, with room between them) in a blocked column that
           stops short of the center light. */
        .yft-story { position:absolute; z-index:2; left:5%; width:47%; top:calc(var(--yft-up) + 4px); bottom:40px; display:flex; flex-direction:column; justify-content:flex-start; min-width:0; padding:0 14px; }
        .yft-dates { color:rgba(255,255,255,.82); font:500 12px/1.2 system-ui,sans-serif; }
        .yft-status { color:var(--gold,#d5b44a); font:700 13px/1 Oswald,sans-serif; letter-spacing:.03em; text-transform:uppercase; }
        .yft-title { margin:9px 0 19px; color:#fff; font:700 clamp(26px,3.5vw,42px)/.95 Oswald,sans-serif; letter-spacing:.01em; text-transform:uppercase; }
        .yft-story p { margin:0; color:#fff; font:400 13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
        .yft-title.long { font-size:clamp(22px,2.6vw,34px); }
        .yft-shouts { display:flex; flex-wrap:wrap; column-gap:14px; row-gap:2px; margin-top:6px; }
        .yft-shouts .yft-star { margin-top:0; white-space:nowrap; }
        .yft-shouts .yft-star span { color:rgba(255,255,255,.62); text-transform:none; }
        .yft-star { margin-top:8px; color:var(--gold,#d5b44a); font:600 10px/1.2 Oswald,sans-serif; letter-spacing:.06em; text-decoration:none; text-transform:uppercase; }
        /* The series beside the hero, laid out to Pete's Nov 2 mock (measured
           on a 360-wide phone, then scaled by --u): the series line and the
           names start at the hero's right edge; names right-justified to
           31.25u past it, runs right-justified to 41.75u, the game number
           centered at 49.75u, in red, between a game's two lines. Rows by the
           slide's height: the series line at 38.5%, games at 46.2%, 60.4%
           and 74.2%, a game's two lines 5% apart. A final's winner in gold. */
        .yft-slide { --u:1.857px; --yft-hero-edge:calc(3% + 94% * 27 / 33 + 6px); }
        .yft-series { position:absolute; z-index:2; left:var(--yft-hero-edge); top:0; bottom:0; width:calc(70 * var(--u)); }
        .yft-series-line { position:absolute; left:0; top:calc(38.5% - var(--u)); color:#fff; font:400 calc(7.25 * var(--u))/1 Arial,Helvetica,sans-serif; white-space:nowrap; }
        .yft-series-game { position:absolute; left:0; width:calc(70 * var(--u)); height:10%; display:grid;
          grid-template-columns:calc(31.25 * var(--u)) calc(10.5 * var(--u)) calc(16 * var(--u)); grid-template-rows:1fr 1fr;
          align-items:start; color:#fff; font:400 calc(7.25 * var(--u))/1 Arial,Helvetica,sans-serif; }
        .yft-series-game:nth-child(1) { top:calc(46.2% - var(--u)); }
        .yft-series-game:nth-child(2) { top:calc(60.4% - var(--u)); }
        .yft-series-game:nth-child(3) { top:calc(74.2% - var(--u)); }
        .yft-sl-name, .yft-sl-runs { justify-self:end; text-align:right; white-space:nowrap; }
        .yft-sl-runs { font-variant-numeric:tabular-nums; }
        .yft-sl-name.win, .yft-sl-runs.win { color:#fbbf10; }
        .yft-sl-game { grid-column:3; grid-row:1 / span 2; align-self:center; justify-self:center; color:#f53a1c; font:700 calc(4.2 * var(--u))/1 Arial,Helvetica,sans-serif; }
        /* The postseason slides' games (up to four) stack from the series line down. */
        .yft-post-scores .yft-series-games { position:absolute; left:0; top:calc(38.5% - var(--u)); bottom:15%; display:grid; align-content:space-between; }
        .yft-post-scores .yft-series-game { position:static; height:auto; row-gap:calc(3 * var(--u)); }
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
        /* The timeline reads over anything behind it: a thin white edge on
           each round's mark, a dark halo on the line, the dots and the
           labels. */
        .yft-rail-track { position:absolute; left:0; right:0; top:8px; height:2px; background:rgba(255,255,255,.3); box-shadow:0 0 0 1px rgba(0,0,0,.45); }
        .yft-tick { position:absolute; top:1px; width:14px; height:14px; margin-left:-7px; padding:0; border:0; background:transparent; cursor:pointer; }
        .yft-tick:disabled { cursor:default; }
        .yft-tick::before { content:''; position:absolute; left:4px; top:3px; width:6px; height:8px; border-radius:1px; background:rgba(255,255,255,.42); box-shadow:0 0 0 1px rgba(255,255,255,.75), 0 0 3px rgba(0,0,0,.9); }
        .yft-tick.W::before { background:#78c988; }
        .yft-tick.L::before { background:#d46f66; }
        .yft-tick.on::before,.yft-tick.now::before { box-shadow:0 0 0 1px #fff, 0 0 0 3px rgba(213,180,74,.85), 0 0 4px rgba(0,0,0,.9); }
        .yft-tick.wk { width:10px; margin-left:-5px; }
        .yft-tick.wk::before { left:3px; top:5px; width:4px; height:4px; border-radius:50%; background:rgba(255,255,255,.5); box-shadow:0 0 0 1px rgba(0,0,0,.55); }
        .yft-tick.wk.on::before, .yft-tick.wk.now::before { background:#d5b44a; box-shadow:0 0 0 2px rgba(213,180,74,.45); }
        .yft-fade { animation:yft-fade .7s ease-out; }
        @keyframes yft-fade { from { opacity:0; } }
        @media (prefers-reduced-motion: reduce) { .yft-fade { animation:none; } }
        .yft-dots { display:flex; gap:4px; margin-top:6px; }
        .yft-dots i { width:5px; height:5px; border-radius:50%; background:rgba(255,255,255,.3); }
        .yft-dots i.on { background:#d5b44a; }
        .yft-tick-label { position:absolute; left:50%; top:16px; transform:translateX(-50%); color:rgba(255,255,255,.82); font:700 13px/1 Oswald,sans-serif; letter-spacing:.02em; white-space:nowrap; text-shadow:0 0 2px #000, 0 0 3px #000, 0 1px 2px rgba(0,0,0,.9); }
        .yft-tick:hover .yft-tick-label { color:#fff; }
        .yft-tick.on .yft-tick-label { color:#d5b44a; }

        @media (max-width:760px) {
          body:has(.yft-hero) { --row3-h:118px; }
          .yat-row3-shell:has(.yft-hero) { height:118px !important; min-height:118px !important; }
          .yft-hero { height:118px; min-height:118px; }
          .yft-person { left:calc(4% + 92% * 15 / 33); width:calc(92% * 12 / 33 + 4px); top:calc(var(--row1-h, 34px) + 4px); height:calc(100% - var(--row1-h, 34px) - 4px);
            --yft-dissolve:linear-gradient(to bottom, #000 calc(100% - 46px), rgba(0,0,0,.35) calc(100% - 18px), transparent calc(100% - 2px)); }
          .yft-hero::after { height:40px; }
          .yft-ghost { left:0; width:31%; }
          .yft-left-meta { left:2.5%; top:5px; gap:1px; }
          .yft-left-meta b { font-size:10px; }
          .yft-left-meta span { font-size:6px; }
          /* Blocked under the school name: the column ends about where row
             2's "FANTASY BRACKET TOURNEY" does. */
          .yft-story { left:5%; width:170px; top:calc(var(--yft-up) + 2px); bottom:22px; padding:0 4px; justify-content:flex-start; }
          .yft-status { font-size:6.5px; line-height:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .yft-title { margin:2px 0 8px; font-size:16px; line-height:.94; }
          .yft-title.long { font-size:13px; }
          .yft-shouts { margin-top:2px; column-gap:6px; row-gap:1px; }
          .yft-shouts .yft-star span { display:none; }
          .yft-story:has(.yft-shouts) p { -webkit-line-clamp:6; }
          /* A two-line headline leaves room for five. */
          .yft-story:has(.yft-title.long) p { -webkit-line-clamp:5; }
          .yft-story p { flex-shrink:0; font-size:7px; line-height:1.16; display:-webkit-box; -webkit-line-clamp:6; -webkit-box-orient:vertical; overflow:hidden; }
          /* No room for the story's dots under six lines on a phone. */
          .yft-dots { display:none; }
          .yft-dots i { width:3px; height:3px; }
          .yft-tick.wk { width:8px; margin-left:-4px; }
          .yft-tick.wk::before { left:2px; top:5px; width:3px; height:3px; }
          .yft-star { margin-top:2px; font-size:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          /* Right of the card, never over it: from just past the R10 tick to the
             edge, the names cut short only if they can't fit. */
          .yft-slide { --u:1px; --yft-hero-edge:calc(4% + 92% * 27 / 33 + 4px); }
          .yft-raffle-cta { left:2.5%; top:calc((100% - 23px) / 2); bottom:auto; width:112px; height:78px; transform:translateY(-50%); }
          .yft-raffle-trophy { left:0; bottom:0; width:67px; height:78px; object-position:left bottom; }
          .yft-raffle-note { left:28px; bottom:4px; width:78px; font-size:10.5px; line-height:.92; letter-spacing:-.045em; -webkit-text-stroke:.6px #000; }
          .yft-nav { display:none; }
          .yft-rail { left:4%; right:4%; bottom:1px; height:24px; }
          .yft-rail-track { top:6px; height:1px; }
          .yft-tick { width:10px; height:10px; margin-left:-5px; top:1px; }
          .yft-tick::before { left:3px; top:2px; width:4px; height:6px; }
          .yft-tick-label { display:block; top:11px; font-size:9px; letter-spacing:0; color:rgba(255,255,255,.82); }
        }
        @media (max-width:640px) {
          /* A phone's row 2 is smaller: "TOURNEY" ends about 160px in. */
          .yft-story { width:146px; }
        }
      `}</style>
    </section>
  );
}
