'use client';

// src/components/bracket/SchoolBracket.tsx
// A school's fantasy page (the Fantasy Bracket Tourney tab), laid out like a
// player profile: where a profile has its stories, this has the school's
// weeks - one horizontal card per game with just the matchup, the nine-inning
// line and the score - and where a profile lists teammates, the narrow
// column is the region's Most Runs Scored Leaderboard. Row 3's timeline
// (FantasyTimeline) has a slide per week.
//
// The cards are in week order, like a profile's game log, and the tab opens
// scrolled so the current round sits right under row 3's timeline (the
// weeks before it a scroll up away). All 30 weeks are there from the start;
// Round 1's opponent is known, each later round's fills in when the round
// before ends.
//
// How each player did is one tap away: a school's name or logo opens its week
// in a drawer - the home team's from the right, the visitor's from the left.
//
// "Now" follows the calendar; ?asof=YYYY-MM-DD previews any date.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type ActiveRosterPlayer, type GameBox, type Index, type LbGame,
  LAST_WEEK, LBT_ROUNDS, REGIONS, WORLD_SERIES, Face, Styles,
  abbr, correctedRosterGame, fmtDate, fmtRange, loadActiveRoster, loadBoxes, loadLiveBox, loadIndex, loadLb, place, previewDate, rankRegion, shortName, standings,
} from './gallery';
import { DAY_NAMES, type CurrentPlayerIdentity, type Star, type WeekCard, calendar, loadCurrentPlayerIdentities, loadStars, masterGames, records, runsThrough, schoolSeason, starLine } from './schoolSeason';
import { type FantasyStageKey, selectStage, stageKeyForWeek, useBracketNav } from './bracketNav';
import BracketRules from './BracketRules';
import PostseasonStage from './PostseasonStage';
import FantasyGameSocial from './FantasyGameSocial';
import { Roboto_Condensed } from 'next/font/google';

// The scoreboard type (the game cards), condensed like the MLB and ESPN apps.
const scoreboardFont = Roboto_Condensed({ subsets: ['latin'], variable: '--yfp-sb', display: 'swap' });

const dates = (index: Index, w: number) => (index.weeks[w - 1] ? fmtRange(index.weeks[w - 1][0], index.weeks[w - 1][1]) : '');
const shareSchoolLabel=(raw:string)=>raw.replace(/,\s*/g,', ').trim();
const drawerSchoolParts=(raw:string)=>{
  const normalized=shareSchoolLabel(raw);
  const m=normalized.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const base=(m?.[1]||normalized).trim().replace(/\bPreparatory\b/gi,'Prep');
  const location=(m?.[2]||'').replace(/,\s*/g,', ').trim();
  const school=/\b(high|prep|academy|school|college)\b/i.test(base)?base:`${base} High School`;
  return { school, location };
};

type Open = { card: WeekCard; side: 'h' | 'a' };

// One week, like a scoreboard app's box: a status pill and the week, then
// the two schools (visitor over home) as the line score itself - crest,
// name, record, innings 1-9, runs, a marker on the winner - then the Alumni
// of the Week. The round is the tab, so it isn't repeated here.
export const shortStage = (stage: string) => stage.replace(/^Round \d+ · /, '').replace(/ leaderboard game$/, ' game');

function WeekCardView({ index, card, me, star, starIdentity, rec, focused, onOpen, domId }: {
  index: Index; card: WeekCard; me: number; star?: Star; starIdentity?: CurrentPlayerIdentity; rec: (h: number, week: number) => string; focused: boolean; onOpen: (o: Open) => void; domId?: string;
}) {
  const g = card.game;
  const S = index.schools;
  const [previewData, setPreviewData] = useState<{ box?: GameBox; homeRoster: ActiveRosterPlayer[]; awayRoster: ActiveRosterPlayer[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!g) { setPreviewData(null); return () => { cancelled = true; }; }
    const fetchBox = () => card.state === 'live' ? loadLiveBox(index,g) : card.file ? loadBoxes(card.file).then((all)=>all[String(g[0])]).catch(()=>undefined) : Promise.resolve(undefined);
    const refresh = () => Promise.all([fetchBox(),loadActiveRoster(g[2]),loadActiveRoster(g[3])]).then(([box,homeRoster,awayRoster])=>{ if(!cancelled) setPreviewData({box,homeRoster,awayRoster}); }).catch(()=>{ if(!cancelled) setPreviewData({box:undefined,homeRoster:[],awayRoster:[]}); });
    refresh();
    const timer = card.state === 'live' ? window.setInterval(refresh,60000) : undefined;
    return () => { cancelled = true; if(timer) window.clearInterval(timer); };
  }, [g, card.file, card.state, index]);
  const gameNo = ((card.week - 1) % 3) + 1;
  const round = Math.ceil(card.week / 3);
  const pill = card.state === 'final' ? 'FINAL' : card.state === 'live' ? (card.days ? `THRU ${DAY_NAMES[card.days - 1].toUpperCase()}` : 'LIVE') : card.state === 'next' ? fmtDate(index.weeks[card.week - 1][0]) : card.state === 'bye' ? 'BYE' : 'TBD';
  const corrected = g && previewData?.box
    ? correctedRosterGame(g[5], card.week, previewData.box.h?.p || [], previewData.box.a?.p || [], previewData.homeRoster, previewData.awayRoster)
    : null;
  const shownInnings = previewData?.box?.innings || corrected?.innings || g?.[5] || [];
  const inningCount = Math.max(9, Math.floor(shownInnings.length / 2));
  const [rawHr, rawAr] = g ? runsThrough(g, card.days) : [0, 0];
  const liveScore: [number,number] | null = card.state === 'live' && previewData?.box?.innings ? [previewData.box.innings.filter((_,i)=>i%2===0).reduce((s,v)=>s+Number(v||0),0),previewData.box.innings.filter((_,i)=>i%2===1).reduce((s,v)=>s+Number(v||0),0)] : null;
  const [hr, ar] = liveScore || (corrected && card.state === 'final' ? corrected.score : [rawHr, rawAr]);
  const correctedWinner = g && corrected && card.state === 'final'
    ? (corrected.score[0] === corrected.score[1] ? g[6] : corrected.score[0] > corrected.score[1] ? g[2] : g[3])
    : g?.[6] ?? null;
  const played = card.state === 'final' || card.state === 'live';

  if (!g) {
    const blankRow = (key: string) => (
      <div className="yfp-green-row" key={key} aria-label="School to be determined">
        <span className="yfp-green-team yfp-green-team-empty" aria-hidden="true" />
        {Array.from({ length: 9 }, (_, i) => <span key={i} className="yfp-green-slot" />)}
        <span className="yfp-green-run" />
      </div>
    );
    const scoreboard = (
      <>
        <div className="yfp-score-head">
          <span>Week {card.week} | {dates(index, card.week)}</span>
          <span>Round {round} | Game {gameNo}</span>
        </div>
        <div className="yfp-green-board" style={{ '--inning-count': 9 } as React.CSSProperties}>
          <div className="yfp-green-row head">
            <span className="yfp-green-status tbd">UPCOMING</span>
            {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => <span key={n}>{n}</span>)}
            <span className="run">R</span>
          </div>
          {blankRow('away')}
          {blankRow('home')}
        </div>
      </>
    );
    const schoolName = shortName(S[me]?.[0] || 'This school');
    const social = (
      <FantasyGameSocial
        gameKey={`sim-2026:school-${me}:week-${card.week}`}
        title={`Round ${round} · Game ${gameNo}`}
        subtitle={`${schoolName} · Opponent TBD`}
        shareText={`Follow ${schoolName} in Round ${round}, Game ${gameNo} of the YAT?STATS High School Alumni Fantasy Tournament.`}
        shareUrl={typeof window === 'undefined' ? '' : `${window.location.origin}${window.location.pathname}?week=${card.week}#sec-fantasy`}
        preview={<div className="yfp-scorecard">{scoreboard}</div>}
      />
    );
    return (
      <article className={`yfp-card yfp-scorecard ${card.state}${focused ? ' focus' : ''}`} id={domId || `fweek-${card.week}`}>
        <div className="yfp-game-split">
          <div className="yfp-game-scorepane">{scoreboard}</div>
          <div className="yfp-game-socialpane">{social}</div>
        </div>
      </article>
    );
  }

  const row = (side: 'a' | 'h') => {
    const h = side === 'h' ? g[2] : g[3];
    const off = side === 'h' ? 0 : 1;
    const runs = side === 'h' ? hr : ar;
    const won = card.state === 'final' && correctedWinner === h;
    const rawName = S[h]?.[0] || '';
    const name = shortName(rawName);
    const location = place(rawName);
    return (
      <div className={`yfp-green-row${h === me ? ' me' : ''}${won ? ' won' : ''}`}>
        <button type="button" className="yfp-green-team" disabled={!played} onClick={() => onOpen({ card, side })}
          aria-label={played ? `${name}: this week's players` : undefined}>
          <span className="yfp-green-abbr">{abbr(name)}</span>
          <span className="yfp-green-full">{name}</span>
          {location ? <span className="yfp-green-place">{location}</span> : null}
        </button>
        {Array.from({ length: inningCount }, (_, i) => i).map((i) => {
          const shown = card.state === 'final' || (card.state === 'live' && i < Math.min(card.days, 9));
          const value = shownInnings[i * 2 + off] || 0;
          return <span key={i} className={`yfp-green-slot${shown && value ? ' scored' : ''}`}>{shown ? value : ''}</span>;
        })}
        <span className="yfp-green-run">{played ? runs : ''}{won ? <i aria-label="winner">◀</i> : null}</span>
      </div>
    );
  };

  const scoreboard = (
    <>
      <div className="yfp-score-head">
        <span>Week {card.week} | {dates(index, card.week)}</span>
        <span>Round {round} | Game {gameNo}</span>
      </div>
      <div className="yfp-green-board" style={{ '--inning-count': inningCount } as React.CSSProperties}>
        <div className="yfp-green-row head">
          <span className={`yfp-green-status ${card.state}`}>{pill}</span>
          {Array.from({ length: inningCount }, (_, i) => i + 1).map((n) => <span key={n}>{n}</span>)}
          <span className="run">R</span>
        </div>
        {row('a')}
        {row('h')}
      </div>
    </>
  );

  const social = g ? (
    <FantasyGameSocial
      gameKey={`sim-2026:${g[0]}`}
      title={`Round ${round} · Game ${gameNo}`}
      subtitle={`${shortName(S[g[3]]?.[0] || '')} ${ar} · ${shortName(S[g[2]]?.[0] || '')} ${hr}`}
      shareText={`Follow the YAT?STATS High School Alumni Fantasy Game between ${shareSchoolLabel(S[g[3]]?.[0] || '')} and ${shareSchoolLabel(S[g[2]]?.[0] || '')}.`}
      shareUrl={typeof window === 'undefined' ? '' : `${window.location.origin}${window.location.pathname}?fantasyGame=${g[0]}&week=${card.week}#sec-fantasy`}
      preview={<div className="yfp-scorecard">{scoreboard}</div>}
    />
  ) : null;

  return (
    <article className={`yfp-card yfp-scorecard ${card.state}${focused ? ' focus' : ''}`} id={domId || `fweek-${card.week}`}>
      {social ? (
        <div className="yfp-game-split">
          <div className="yfp-game-scorepane">{scoreboard}</div>
          <div className="yfp-game-socialpane">{social}</div>
        </div>
      ) : scoreboard}
    </article>
  );
}

// Where a drawer opens: on desktop only over row 5 (the timeline and the
// ticker stay in view above it, the footer ad below); on a phone the whole
// screen.
function DrawerWrap({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const [box, setBox] = useState<{ top: number } | null>(null);
  useEffect(() => {
    const place = () => {
      const row5 = document.querySelector('.yfz') || document.querySelector('.yat-row5-shell');
      setBox(window.matchMedia('(min-width: 900px)').matches && row5 ? { top: Math.max(0, row5.getBoundingClientRect().top) } : null);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className={`yfp-drawer-wrap${box ? ' row5' : ''}`} style={box ? { top: box.top } : undefined} role="presentation" onClick={onClose}>
      {children}
    </div>,
    document.body,
  );
}

// A school's week in a drawer: every player's line, OPS+ and FIP-, and how
// each run was scored. Home from the right, visitor from the left.
function TeamDrawer({ index, open, onClose }: { index: Index; open: Open; onClose: () => void }) {
  const { card, side } = open;
  const g = card.game!;
  const homeId = g[2], awayId = g[3];
  const [box, setBox] = useState<Record<string, GameBox> | null>(null);
  const [rosters, setRosters] = useState<{ home: ActiveRosterPlayer[]; away: ActiveRosterPlayer[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const refreshBox = () => card.state === 'live' ? loadLiveBox(index,g).then((live)=>{ if(!cancelled) setBox(live ? {[String(g[0])]:live}:{ }); }) : card.file ? loadBoxes(card.file).then((b)=>{ if(!cancelled) setBox(b); }) : Promise.resolve();
    refreshBox().catch(()=>{ if(!cancelled) setBox({}); });
    const timer = card.state === 'live' ? window.setInterval(()=>{ refreshBox().catch(()=>{}); },60000) : undefined;
    Promise.all([loadActiveRoster(homeId),loadActiveRoster(awayId)]).then(([home,away])=>{ if(!cancelled) setRosters({home,away}); }).catch(()=>{ if(!cancelled) setRosters({home:[],away:[]}); });
    return () => { cancelled = true; if(timer) window.clearInterval(timer); };
  }, [card.file, card.state, homeId, awayId, index, g]);
  const S = index.schools;
  const h = side === 'h' ? homeId : awayId;
  const drawerSchool = drawerSchoolParts(S[h]?.[0] || '');
  const stageGameNo = Number(card.stage.match(/Game\s+(\d+)/i)?.[1] || 1);
  const drawerGameLabel = card.week <= 30
    ? `WEEK ${card.week} - ROUND ${Math.ceil(card.week / 3)} - GAME ${((card.week - 1) % 3) + 1}`
    : card.week === 31
      ? `WEEK 31 - SEASON CHAMPIONSHIP ROUND 1 - GAME ${stageGameNo}`
      : card.week === 32
        ? `WEEK 32 - SEASON CHAMPIONSHIP ROUND 2 - GAME ${stageGameNo}`
        : card.week === 33
          ? 'WEEK 33 - SEASON CHAMPIONSHIP GAME'
          : 'WEEK 34 - YAT?STATS WORLD SERIES';
  // Staged simulation: the drawer only shows results once the week's games
  // are final. Before that it's the empty Day-1 state (no leaked sim data).
  const played = card.state === 'final' || card.state === 'live';
  const [hr, ar] = played ? runsThrough(g, 7) : [0, 0];
  return (
    <DrawerWrap onClose={onClose}>
      <aside className={`bl bl-embed yfp-drawer ${side === 'h' ? 'right' : 'left'}`} role="dialog" aria-modal="true"
        aria-label={`${shortName(S[h]?.[0] || '')}, week ${card.week}`} onClick={(e) => e.stopPropagation()}>
        <div className="yfp-drawer-head">
          <div>
            {drawerSchool.location ? <span className="yfp-drawer-location">{drawerSchool.location}</span> : null}
            <b className="yfp-drawer-school">{drawerSchool.school}</b>
            <span className="yfp-drawer-game">{drawerGameLabel}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <Face side={side} label={card.stage} week={card.week} dates={dates(index, card.week)} home={homeId} away={awayId}
          names={[shortName(S[homeId]?.[0] || ''), shortName(S[awayId]?.[0] || '')]}
          locations={[place(S[homeId]?.[0] || ''), place(S[awayId]?.[0] || '')]}
          score={[hr, ar]} innings={played ? g[5] : []} winner={played ? g[6] : null}
          decidedBy={played ? g[4] : ''} box={played && box ? box[String(g[0])] : undefined} loading={!rosters}
          homeRoster={rosters?.home} awayRoster={rosters?.away} drawerMode played={played} />
      </aside>
    </DrawerWrap>
  );
}

// The rules, in a drawer from the right.
function RulesDrawer({ onClose }: { onClose: () => void }) {
  return (
    <DrawerWrap onClose={onClose}>
      <aside className="bl bl-embed yfp-drawer right" role="dialog" aria-modal="true" aria-label="Rules" onClick={(e) => e.stopPropagation()}>
        <div className="yfp-drawer-head"><div><b>Rules</b><span>How it&apos;s played and scored</span></div><button type="button" onClick={onClose} aria-label="Close">✕</button></div>
        <BracketRules />
      </aside>
    </DrawerWrap>
  );
}

// The narrow column (a profile's teammates): the Most Runs Scored
// Leaderboards through the last final week - all 8 regions, or every school
// A-Z (like the teammates' A-Z / Year). Opens on this school.
function RegionColumn({ index, lb, me, final, onRules }: { index: Index; lb: LbGame[]; me: number; final: number; onRules: () => void }) {
  const [order, setOrder] = useState<'region' | 'az'>('region');
  const [nationalRanks, setNationalRanks] = useState<Record<string, number>>({});
  const through = Math.min(final, LAST_WEEK);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/bracket/school-ranks')
      .then((r) => r.ok ? r.json() : { ranks: {} })
      .then((data) => { if (!cancelled) setNationalRanks(data?.ranks || {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const boards = useMemo(() => {
    const st = standings(index, lb, through);
    return Object.keys(REGIONS).map((k) => ({ region: Number(k), ranked: rankRegion(index, st, Number(k)) }));
  }, [index, lb, through]);
  const az = useMemo(() => {
    const rows = boards.flatMap((b) => b.ranked.map((s, i) => ({ s, region: b.region, rank: i + 1, name: shortName(index.schools[s.h]?.[0] || '') })));
    return rows.sort((x, y) => x.name.localeCompare(y.name));
  }, [boards, index]);
  const ref = useRef<HTMLElement | null>(null);
  // Bring this school's line into view (inside the column only).
  useEffect(() => {
    const col = ref.current;
    const row = col?.querySelector<HTMLElement>('li.me');
    if (col && row) col.scrollTop = row.offsetTop - col.clientHeight / 3;
  }, [order]);
  const line = (s: { h: number; rf: number; ra: number }, rk: string, title: string) => (
    <li key={s.h} className={s.h === me ? 'me' : ''} title={title}>
      <span className="rk">{rk}</span>
      <a href={`/${s.h}#sec-fantasy`}>{shortName(index.schools[s.h]?.[0] || '')}</a>
      <span className="rf">{s.rf}</span>
    </li>
  );
  const diff = (s: { rf: number; ra: number }) => `${s.rf - s.ra >= 0 ? '+' : ''}${s.rf - s.ra}`;
  return (
    <aside className="yfp-lb" aria-label="Most Runs Scored Leaderboards" ref={ref}>
      <div className="yfp-lb-title">Most Runs Scored</div>
      <div className="yfp-lb-sub">{through ? `Thru week ${through}` : 'Starts week 1'} · runs, then run differential</div>
      <div className="yfp-lb-sticky">
        <div className="yfp-lb-sort" role="group" aria-label="Order">
          <button type="button" className={order === 'region' ? 'on' : ''} aria-pressed={order === 'region'} onClick={() => setOrder('region')}>Region</button>
          <button type="button" className={order === 'az' ? 'on' : ''} aria-pressed={order === 'az'} onClick={() => setOrder('az')}>A–Z</button>
        </div>
        <div className="yfp-lb-cols" aria-hidden="true">
          <span>{order === 'region' ? 'SEED' : 'RANK'}</span><span>SCHOOL</span><span>RUNS</span>
        </div>
      </div>
      {order === 'region' ? boards.map((b) => (
        <section key={b.region} className="yfp-lb-group">
          <div className="yfp-lb-head"><span>{b.region}</span> {REGIONS[b.region]}</div>
          <ol>{b.ranked.map((s, i) => line(s, String(index.schools[s.h]?.[2] ?? '—'), `${index.schools[s.h]?.[0]} · seed #${index.schools[s.h]?.[2] ?? '—'} in Region ${b.region} · leaderboard #${i + 1} · ${s.rf} runs (${diff(s)})`))}</ol>
        </section>
      )) : (
        <ol>{az.map((x) => {
          const national = nationalRanks[String(x.s.h)];
          return line(x.s, national ? `#${national}` : '—', `${index.schools[x.s.h]?.[0]} · national rank ${national ? `#${national}` : 'not ranked'} · #${x.rank} in Region ${x.region} · ${x.s.rf} runs (${diff(x.s)})`);
        })}</ol>
      )}
      <button type="button" className="yfp-lb-rules" onClick={onRules}>Rules · how it&apos;s scored</button>
      <p className="yfp-lb-note">After week 30 each region&apos;s leader plays in the Season Championship Tournament.</p>
    </aside>
  );
}

// Every bracket game in the tournament by master game # (#1-#3,069), then the
// postseason. A game shows its schools once its round is set, its score once
// it's played; this school's games in gold. Opens on this week's games.
function AllGames({ index, me, cal, onOpen }: { index: Index; me: number; cal: { week: number; final: number; days: number }; onOpen: (o: Open) => void }) {
  const S = index.schools;
  const rows = useMemo(() => {
    const list: { key: string; no: string; stage: string; region: number; card: WeekCard; set: boolean }[] = masterGames(index).map((m) => {
      const w = m.game[1];
      const state = w <= cal.final ? 'final' : w === cal.week ? 'live' : 'next';
      return {
        key: `m${m.no}`, no: String(m.no), stage: `R${m.round} G${m.gameNo}`, region: m.region,
        card: { week: w, stage: `Round ${m.round} · Game ${m.gameNo}`, state, game: m.game, file: `d-${m.round}-${m.region}`, days: w <= cal.final ? 7 : w === cal.week ? cal.days : 0 } as WeekCard,
        set: m.round === 1 || cal.final >= (m.round - 1) * 3,
      };
    });
    for (const { game: g } of index.lbt) {
      if (cal.final < g[1] - 1) continue;
      const state = g[1] <= cal.final ? 'final' : g[1] === cal.week ? 'live' : 'next';
      const stage = g[1] === LAST_WEEK + 3 ? 'SC Game' : `SC ${LBT_ROUNDS[g[1]].replace('Round ', 'R')}`;
      list.push({ key: `t${g[0]}`, no: '–', stage, region: 0, set: true, card: { week: g[1], stage: g[1] === LAST_WEEK + 3 ? 'Season Championship Game' : `Season Championship ${LBT_ROUNDS[g[1]]}`, state, game: g, file: 'd-lbt', days: g[1] <= cal.final ? 7 : g[1] === cal.week ? cal.days : 0 } as WeekCard });
    }
    for (const g of index.gf) {
      if (cal.final < g[1] - 1) continue;
      const state = g[1] <= cal.final ? 'final' : g[1] === cal.week ? 'live' : 'next';
      list.push({ key: `g${g[0]}`, no: '–', stage: 'World Series', region: 0, set: true, card: { week: g[1], stage: WORLD_SERIES, state, game: g, file: 'd-gf', days: g[1] <= cal.final ? 7 : g[1] === cal.week ? cal.days : 0 } as WeekCard });
    }
    return list;
  }, [index, cal]);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const box = ref.current;
    const first = box?.querySelector<HTMLElement>(`tr[data-week="${Math.max(1, Math.min(cal.week, index.weeks.length))}"]`);
    const head = box?.querySelector('thead')?.getBoundingClientRect().height || 0;
    if (box && first) box.scrollTop = first.offsetTop - head;
  }, [cal.week, index.weeks.length]);
  const name = (h: number) => shortName(S[h]?.[0] || '');
  return (
    <div className="yfz-all" ref={ref}>
      <table>
        <thead><tr><th>#</th><th>Wk</th><th>Game</th><th className="t">Visitor</th><th>R</th><th>R</th><th className="t">Home</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const g = r.card.game!;
            const mine = g[2] === me || g[3] === me;
            const played = r.set && (r.card.state === 'final' || r.card.state === 'live');
            const [hr, ar] = played ? runsThrough(g, r.card.days) : [0, 0];
            const team = (side: 'h' | 'a') => {
              const h = side === 'h' ? g[2] : g[3];
              if (!r.set) return <span className="tbd">TBD</span>;
              const won = r.card.state === 'final' && g[6] === h;
              return (
                <button type="button" className={`${h === me ? 'me' : ''}${won ? ' won' : ''}`} disabled={!played} onClick={() => onOpen({ card: r.card, side })}>{name(h)}</button>
              );
            };
            return (
              <tr key={r.key} data-week={r.card.week} className={`${mine ? 'mine' : ''}${r.card.state === 'live' ? ' live' : ''}`}>
                <td className="no">{r.no}</td>
                <td>{r.card.week}</td>
                <td className="st">{r.stage}{r.region ? <small> · {r.region}</small> : null}</td>
                <td className="t">{team('a')}</td>
                <td className="r">{played ? ar : ''}</td>
                <td className="r">{played ? hr : ''}</td>
                <td className="t">{team('h')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function SchoolBracket({ hsid }: { hsid: string }) {
  const me = Number(hsid);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState<Index | null>(null);
  const [lb, setLb] = useState<LbGame[] | null>(null);
  const [error, setError] = useState('');
  const [asof, setAsof] = useState('');
  const [open, setOpen] = useState<Open | null>(null);
  const [rules, setRules] = useState(false);
  const [focused, setFocused] = useState(0);
  const [stars, setStars] = useState<Record<number, Star> | null>(null);
  const [identities, setIdentities] = useState<Record<string, CurrentPlayerIdentity>>({});
  const nav = useBracketNav();

  // Load only once the tab is on screen (the section is hidden until then).
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); setVisible(true); }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    Promise.all([loadIndex(), loadLb()])
      .then(([i, g]) => { setAsof(previewDate()); setIndex(i); setLb(g); })
      .catch((e) => setError(String(e)));
  }, [visible]);

  const cards = useMemo(() => (index && lb && asof ? schoolSeason(index, lb, me, asof) : []), [index, lb, asof, me]);
  const region = index?.schools[me]?.[1];
  useEffect(() => {
    if (!region) return;
    let cancelled = false;
    loadStars(region).then((all) => { if (!cancelled) setStars(all[me] || {}); });
    return () => { cancelled = true; };
  }, [region, me]);
  useEffect(() => {
    const ids = Object.values(stars || {}).map((s) => s[5]);
    if (!ids.length) { setIdentities({}); return; }
    let cancelled = false;
    loadCurrentPlayerIdentities(ids).then((rows) => { if (!cancelled) setIdentities(rows); });
    return () => { cancelled = true; };
  }, [stars]);
  const cal = useMemo(() => (index && asof ? calendar(index, asof) : null), [index, asof]);
  const rec = useMemo(() => (index && lb ? records(index, lb) : () => ''), [index, lb]);

  // One canonical 14-stage season navigation. Row 3, Row 5 and the dock
  // all read/write the same stage key so the page cannot show mismatched rounds.
  const tabs = useMemo(() => {
    const t: { key:FantasyStageKey; label:string; list:WeekCard[] }[] = [];
    for (let r=1;r<=10;r++) t.push({key:stageKeyForWeek((r-1)*3+1),label:`R${r}`,list:cards.filter(c=>c.week<=30&&Math.ceil(c.week/3)===r)});
    t.push({key:'c1',label:'C1',list:cards.filter(c=>c.week===31)});
    t.push({key:'c2',label:'C2',list:cards.filter(c=>c.week===32)});
    t.push({key:'cg',label:'CG',list:cards.filter(c=>c.week===33)});
    t.push({key:'yws',label:'YWS',list:cards.filter(c=>c.week===34)});
    return t;
  },[cards]);

  const nowTab = useMemo(() => {
    if(!cal||cal.week<1) return 'r1';
    return stageKeyForWeek(Math.min(34,cal.week));
  },[cal]);
  const tab = nav.stageKey || nowTab;

  const pickTab = (key:FantasyStageKey) => {
    selectStage(key);
    const list=tabs.find(t=>t.key===key)?.list||[];
    if(list[0]) setFocused(list[0].week);
  };
  // A hero click/focus also changes the canonical stage.
  useEffect(() => {
    if(!nav.focusSeq||!nav.focusWeek) return;
    const key=stageKeyForWeek(nav.focusWeek);
    const on=window.setTimeout(()=>{selectStage(key);setFocused(nav.focusWeek);},0);
    const off=window.setTimeout(()=>setFocused(0),2200);
    return()=>{window.clearTimeout(on);window.clearTimeout(off);};
  },[nav.focusSeq,nav.focusWeek]);

  useEffect(()=>{
    if(!cards.length) return;
    const qs=new URLSearchParams(window.location.search);
    const gid=Number(qs.get('fantasyGame')||0);
    if(!gid) return;
    const card=cards.find(c=>c.game?.[0]===gid);
    if(!card) return;
    selectStage(stageKeyForWeek(card.week));
    setFocused(card.week);
    requestAnimationFrame(()=>document.getElementById(`fweek-${card.week}`)?.scrollIntoView({block:'nearest'}));
  },[cards]);

  const school = index?.schools[me];
  const cur = tabs.find((t) => t.key === tab);
  const roundTitle=(key:FantasyStageKey)=>{
    if(key==='c1') return 'Championship Round 1 · Week 31';
    if(key==='c2') return 'Championship Round 2 · Week 32';
    if(key==='cg') return 'Championship Game · Week 33';
    if(key==='yws') return 'YAT?STATS World Series · Week 34';
    const r=Number(key.slice(1)); const a=index?.weeks[r*3-3],b=index?.weeks[r*3-1];
    return `Round ${r} · weeks ${r*3-2}–${r*3}${a&&b?` · ${fmtRange(a[0],b[1])}`:''}`;
  };
  return (
    <div className={`yfp ${scoreboardFont.variable}`}>
      <div ref={sentinel} className="yfp-top" />
      {error && <p className="yfp-empty">Could not load the bracket ({error}).</p>}
      {!error && (!index || !lb || !cal) && <p className="yfp-empty">Loading the 2026 season…</p>}
      {index && lb && cal && (
        <div className="yfz">
          <div className="yfz-panel">
            <div className="yfz-round">
              {tab === 'c1' || tab === 'c2' || tab === 'cg' || tab === 'yws' ? (
                <PostseasonStage stage={tab} index={index} me={me} cal={cal} rec={rec} onOpen={setOpen} />
              ) : (
                <div className="yfz-cards">
                  {cur?.list.map((c)=><WeekCardView key={c.week} index={index} card={c} me={me} star={stars?.[c.week]} starIdentity={stars?.[c.week]?identities[stars[c.week][5]]:undefined} rec={rec} focused={focused===c.week} onOpen={setOpen}/>)}
                  {cur&&cur.list.length===0?<p className="yfp-empty">No game for this school in this stage.</p>:null}
                  {!school&&<p className="yfp-empty">This school isn&apos;t one of the 1,024 in the 2026 bracket.</p>}
                </div>
              )}
            </div>
            <RegionColumn index={index} lb={lb} me={me} final={cal.final} onRules={()=>setRules(true)}/>
          </div>
          {/* The FunZone's icon row, pinned above the footer ad. */}
          <nav className="yfz-dock" aria-label="Rounds">
            <div className="yfz-dock-tabs" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
              {tabs.map((t) => (
                <button key={t.key} type="button" className={`yfz-tab${t.key===tab?' on':''}${t.key===nowTab&&cal.week>=1&&cal.week<=index.weeks.length?' now':''}`}
                  aria-pressed={t.key===tab} onClick={()=>pickTab(t.key)} title={roundTitle(t.key)}>
                  <b>{t.label}</b>
                </button>
              ))}
            </div>
          </nav>
        </div>
      )}
      {index && open && <TeamDrawer index={index} open={open} onClose={() => setOpen(null)} />}
      {rules && <RulesDrawer onClose={() => setRules(false)} />}
      <Styles />
      <style jsx global>{`
        .yfp {
          --yfp-card-bg: rgba(255,255,255,.055);
          --yfp-card-border: rgba(255,255,255,.14);
          --yfp-text: rgba(255,255,255,.88);
          --yfp-muted: rgba(255,255,255,.55);
          --yfp-faint: rgba(255,255,255,.3);
          --yfp-strong: rgba(255,255,255,.95);
          --yfp-gold: var(--gold, #ffc107);
          --yfp-win: #7fd18b; --yfp-loss: #e2786a;
          padding: 10px 10px 20px; color: var(--yfp-text);
        }
        body.light-theme .yfp {
          --yfp-card-bg: rgba(255,255,255,.52);
          --yfp-card-border: rgba(53,43,30,.18);
          --yfp-text: rgba(31,25,18,.86);
          --yfp-muted: rgba(31,25,18,.55);
          --yfp-faint: rgba(31,25,18,.3);
          --yfp-strong: rgba(31,25,18,.94);
          --yfp-gold: #b78600;
          --yfp-win: #2e8b45; --yfp-loss: #b8472f;
        }
        .yfp-top { height: 1px; }
        .yfp-empty { padding: 40px 12px; text-align: center; color: var(--yfp-muted); font: 400 14px/1.45 system-ui, sans-serif; }
        .yfp-layout { display: grid; grid-template-columns: minmax(0, 1fr) 180px; gap: 16px; align-items: start; }
        .yfp-main { min-width: 0; }
        .yfp-kick { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; margin: 0 0 10px; color: var(--yfp-gold); font: 700 9px/1.3 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
        .yfp-kick span { color: var(--yfp-muted); }
        .yfp-group { margin: 0 0 16px; }
        .yfp-group h3.now::after { content: ' · now'; color: var(--yfp-muted); }
        .yfp-group h3 { margin: 0 0 8px; color: var(--yfp-gold); font: 400 14px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
        .yfp-feed { display: flex; flex-direction: column; gap: 8px; }

        /* A week as the green manual ballpark scoreboard from the approved mockup.
           School logos are intentionally omitted until all 1,024 schools have real crests. */
        .yfp-card.yfp-scorecard { padding:0; overflow:hidden; border-radius:7px; background:rgba(255,255,255,.035); }
        .yfp-score-head { display:flex; justify-content:space-between; gap:6px; padding:3px 6px 2px; background:#9c7f22; color:#fff5cf; font:700 7px/1 var(--yfp-sb),"Arial Narrow",Oswald,sans-serif; letter-spacing:.035em; text-transform:uppercase; }
        .yfp-green-board { margin:0; padding:5px 6px 5px; background:linear-gradient(180deg,#1f6546,#174c35); border-top:1px solid rgba(255,255,255,.14); border-bottom:1px solid #0d3022; box-shadow:inset 0 1px 0 rgba(255,255,255,.12),inset 0 -2px 5px rgba(0,0,0,.24); }
        .yfp-green-row { display:grid; grid-template-columns:minmax(62px,1.1fr) repeat(var(--inning-count,9),minmax(18px,1fr)) minmax(24px,0.7fr); gap:2px; align-items:center; margin-top:2px; }
        .yfp-green-row.head { margin-top:0; color:#eef7ef; font:700 8px/1 Oswald,sans-serif; text-align:center; }
        .yfp-green-row.head>span:not(:first-child) { display:grid; place-items:center; }
        .yfp-green-row.head .run { color:#ffd34f; }
        .yfp-green-status { justify-self:start; padding:2px 4px 1px; border-radius:3px; background:#edf4ee; color:#173b2c; font:800 7px/1 Oswald,sans-serif; letter-spacing:.07em; }
        .yfp-green-status.live { background:#c83732; color:#fff; }
        .yfp-green-status.next,.yfp-green-status.tbd,.yfp-green-status.bye { background:rgba(255,255,255,.12); color:#fff; }
        .yfp-green-team { min-width:0; display:block; padding:0 5px 0 0; border:0; background:transparent; color:#fff; text-align:left; cursor:pointer; }
        .yfp-green-team:disabled { cursor:default; }
        .yfp-green-abbr { display:none; font:800 12px/1 Oswald,sans-serif; letter-spacing:.03em; }
        .yfp-green-full { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:800 11px/1 Oswald,sans-serif; }
        .yfp-green-place { display:block; margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#a8bbb0; font:600 6px/1 Oswald,sans-serif; letter-spacing:.035em; text-transform:uppercase; }
        .yfp-green-row.me .yfp-green-team { color:#ffd34f; }
        .yfp-green-slot { height:20px; display:grid; place-items:center; border-radius:3px; background:#0d2d20; box-shadow:inset 0 1px 3px rgba(0,0,0,.75); color:#edf4ee; font:800 11px/1 Oswald,sans-serif; font-variant-numeric:tabular-nums; }
        .yfp-green-slot.scored { color:#fff; }
        .yfp-green-run { position:relative; height:20px; display:grid; place-items:center; border-radius:3px; background:#0d2d20; color:#ffd34f; font:800 13px/1 Oswald,sans-serif; }
        .yfp-green-row.won .yfp-green-run { background:#f3c735; color:#15251d; }
        .yfp-green-run i { position:absolute; right:-7px; color:#fff; font-style:normal; font-size:8px; }
        .yfp-scorecard .yfp-star { margin:5px 8px 0; }
        .yfp-scorecard .yfp-social { margin-left:8px; margin-right:8px; }

        /* Desktop: keep school names beside the innings, and use the other
           half of the card for that game's social thread. Mobile remains stacked. */
        @media (min-width:900px) {
          .yfp-game-split {
            display:grid;
            grid-template-columns:minmax(360px,1fr) minmax(320px,1fr);
            min-height:126px;
            align-items:stretch;
          }
          .yfp-game-scorepane {
            min-width:0;
            overflow:hidden;
            border-right:1px solid var(--yfp-card-border);
          }
          .yfp-game-socialpane {
            min-width:0;
            min-height:0;
            padding:4px 8px 6px 10px;
            overflow:hidden;
          }
          .yfp-game-scorepane .yfp-green-row {
            grid-template-columns:118px repeat(var(--inning-count,9),20px) 30px;
            width:max-content;
            max-width:100%;
            justify-content:start;
          }
          .yfp-game-scorepane .yfp-green-slot,
          .yfp-game-scorepane .yfp-green-run { height:22px; }
          .yfp-game-scorepane .yfp-green-full {
            font-family:var(--yfp-sb),"Arial Narrow",Oswald,sans-serif;
            font-size:10px;
            letter-spacing:-.025em;
          }
          .yfp-game-scorepane .yfp-green-place { font-size:5.5px; }
          .yfp-game-socialpane .fgs-inline.ysv-post {
            height:100%;
            min-height:0;
            display:flex;
            flex-direction:column;
            overflow:hidden;
          }
          .yfp-game-socialpane .fgs-inline .ysv-counts,
          .yfp-game-socialpane .fgs-inline .ysv-actions { flex:none; }
          .yfp-game-socialpane .fgs-desktop-only {
            flex:1;
            min-height:0;
            display:flex!important;
            flex-direction:column;
            overflow:hidden;
          }
          .yfp-game-socialpane .fgs-inline .ysv-comments {
            flex:1;
            min-height:0;
            overflow-y:auto;
            overscroll-behavior:contain;
            scrollbar-width:thin;
            padding-right:4px;
          }
          .yfp-game-socialpane .fgs-inline .ysv-composer {
            flex:none;
            margin-top:4px;
            padding-top:6px;
            border-top:1px solid var(--yfp-card-border);
          }
        }

        /* A week, like a scoreboard app's box. */
        .yfp-card { border: 1px solid var(--yfp-card-border); border-radius: 6px; background: var(--yfp-card-bg); padding: 7px 10px 6px; transition: border-color .15s ease, box-shadow .15s ease; }
        .yfp-card.focus { border-color: var(--yfp-gold); box-shadow: 0 0 0 2px var(--yfp-gold); }
        .yfp-card.tbd, .yfp-card.bye { opacity: .7; }
        .yfp-head { display: flex; align-items: center; gap: 8px; min-width: 0; margin: 0 0 3px; }
        .yfp-pill { flex: 0 0 auto; padding: 2px 5px 1px; border-radius: 3px; background: var(--yfp-strong); color: #0b0b0b; font: 700 10px/1.1 var(--yfp-sb), "Arial Narrow", Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
        .yfp-pill.live { background: #d32f2f; color: #fff; }
        .yfp-pill.next, .yfp-pill.tbd, .yfp-pill.bye { background: transparent; color: var(--yfp-muted); box-shadow: inset 0 0 0 1px var(--yfp-card-border); }
        .yfp-eye { flex: 1; min-width: 0; color: var(--yfp-text); font: 700 11px/1.1 var(--yfp-sb), "Arial Narrow", Oswald, sans-serif; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .yfp-dates { flex: 0 0 auto; font-style: normal; color: var(--yfp-muted); font: 500 10px/1.1 var(--yfp-sb), "Arial Narrow", Oswald, sans-serif; letter-spacing: .04em; text-transform: uppercase; }
        .yfp-box { width: 100%; border-collapse: collapse; table-layout: fixed; font: 500 13px/1 var(--yfp-sb), "Arial Narrow", Oswald, sans-serif; font-variant-numeric: tabular-nums; color: var(--yfp-muted); }
        .yfp-box thead th { padding: 0 0 2px; color: var(--yfp-faint); font-size: 10px; font-weight: 700; text-align: center; }
        .yfp-box td { padding: 3px 0; text-align: center; }
        .yfp-box td.hit { color: var(--yfp-strong); font-weight: 700; }
        .yfp-box th.tm { text-align: left; padding: 2px 6px 2px 0; font-weight: 400; }
        /* Innings are narrow fixed columns grouped at the right, like an MLB line score; the school takes the rest. */
        .yfp-box thead th:not(.tm):not(.r) { width: 24px; }
        .yfp-box .r { width: 34px; text-align: right; padding-right: 12px; position: relative; color: var(--yfp-strong); font: 800 19px/1 var(--yfp-sb), "Arial Narrow", Oswald, sans-serif; }
        .yfp-box thead .r { font-size: 10px; color: var(--yfp-faint); }
        .yfp-box tr.lost .r, .yfp-box tr.lost .tm b { color: var(--yfp-muted); }
        .yfp-won { position: absolute; right: 0; top: 50%; transform: translateY(-50%); font-size: 9px; color: var(--yfp-strong); }
        .yfp-box .tm button { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
        .yfp-box .tm button:disabled { cursor: default; }
        .yfp-box .tm b { min-width: 0; color: var(--yfp-strong); font: 700 15px/1.1 var(--yfp-sb), "Arial Narrow", Oswald, sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .yfp-box .tm small { flex: 0 0 auto; color: var(--yfp-muted); font: 500 11px/1 var(--yfp-sb), "Arial Narrow", Oswald, sans-serif; }
        .yfp-box tr.me .tm b { color: var(--yfp-gold); }
        .yfp-box .tm button:not(:disabled):hover b { text-decoration: underline; }
        .yfp-star { margin-top: 3px; color: var(--yfp-gold); font: 500 11px/1.25 var(--yfp-sb), "Arial Narrow", Oswald, sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .yfp-star a { color: var(--yfp-text); text-decoration: none; }
        .yfp-star a:hover { color: var(--yfp-gold); text-decoration: underline; }
        .yfp-note { margin-top: 4px; color: var(--yfp-muted); font: 400 11px/1.35 system-ui, sans-serif; }
        .yfp-tbd { display: flex; align-items: center; gap: 10px; margin-top: 6px; color: var(--yfp-muted); font: 500 13px/1.2 Oswald, sans-serif; letter-spacing: .03em; }
        .yfp-tbd small { display: block; margin-top: 2px; font: 400 11px/1.3 system-ui, sans-serif; letter-spacing: 0; }
        .yfp-q { width: 34px; height: 34px; flex: 0 0 auto; display: grid; place-items: center; border: 1px dashed var(--yfp-card-border); border-radius: 50%; font: 400 20px/1 "Bebas Neue", Oswald, sans-serif; }

        /* The leaderboard column (a profile's teammates). */
        /* Pinned just under rows 1-3 while the weeks scroll. */
        .yfp-lb { min-width: 0; position: sticky; top: calc(var(--row1-h, 36px) + var(--row2-h, 54px) + var(--row3-h, 100px) + 8px); max-height: calc(100dvh - var(--row1-h, 36px) - var(--row2-h, 54px) - var(--row3-h, 100px) - var(--footerH, 66px) - 16px); overflow-y: auto; font: 400 9px/1.28 system-ui, sans-serif; }
        .yfp-lb-title { color: var(--yfp-gold); font: 700 9px/1 Oswald, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
        .yfp-lb-sub { margin: 2px 0 4px; color: var(--yfp-muted); font-size: 7px; line-height:1.15; }
        .yfp-lb-sticky { position:sticky; top:0; z-index:2; margin:0 0 6px; padding:2px 0 3px; background:var(--bg,#070707); }
        body.light-theme .yfp-lb-sticky { background:var(--bg,#f4efe6); }
        .yfp-lb-sort { display: flex; gap: 2px; margin: 0 0 4px; padding: 0; }
        .yfp-lb-cols { display:grid; grid-template-columns:22px minmax(0,1fr) auto; gap:4px; color:var(--yfp-faint); font:700 6.5px/1 Oswald,sans-serif; letter-spacing:.08em; text-transform:uppercase; }
        .yfp-lb-cols span:first-child { text-align:right; }
        .yfp-lb-cols span:last-child { text-align:right; }
        .yfp-lb-sort button { flex: 1; min-height: 18px; padding: 0 2px; border: 1px solid var(--yfp-card-border); border-radius: 2px; background: var(--yfp-card-bg); color: var(--yfp-muted); font: 700 7px/1 Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
        .yfp-lb-sort button.on { border-color: var(--yfp-gold); color: var(--yfp-gold); }
        .yfp-lb-group { margin: 0 0 9px; }
        .yfp-lb-head { color: var(--yfp-strong); font: 700 7.5px/1.2 Oswald, sans-serif; letter-spacing: .05em; text-transform: uppercase; }
        .yfp-lb-head span { color: var(--yfp-gold); }
        .yfp-lb ol { margin: 0; padding: 0; list-style: none; }
        .yfp-lb li { display: grid; grid-template-columns: 22px minmax(0,1fr) auto; gap: 4px; padding: 1px 0; }
        .yfp-lb li .rk { color: var(--yfp-faint); text-align: right; font-size: .9em; }
        .yfp-lb li a { color: inherit; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .yfp-lb li a:hover { color: var(--yfp-gold); text-decoration: underline; }
        .yfp-lb li .rf { color: var(--yfp-muted); font-variant-numeric: tabular-nums; }
        .yfp-lb li.me, .yfp-lb li.me .rf, .yfp-lb li.me .rk { color: var(--yfp-gold); font-weight: 700; }
        .yfp-lb-rules { display: block; width: 100%; margin: 10px 0 0; min-height: 26px; border: 1px solid var(--yfp-gold); border-radius: 4px; background: transparent; color: var(--yfp-gold); font: 600 9px/1 Oswald, sans-serif; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; }
        .yfp-lb-note { margin: 8px 0 0; color: var(--yfp-muted); font-size: 7.5px; line-height: 1.35; }

        /* The FunZone: exactly the screen under rows 1-4, above the footer
           ad and the pinned round buttons - one round at a time, no page
           scrolling (like the profile's FunZone). */
        .yfp:has(.yfz) { padding: 0; }
        .yfz { --yfz-dock-h:58px; position:relative; height:calc(100dvh - var(--row1-h,36px) - var(--row2-h,54px) - var(--row3-h,100px) - var(--row4-h,56px) - var(--footerH,66px)); min-height:318px; max-height:none; overflow:hidden; }
        .yfz-panel { position:absolute; inset:0 0 var(--yfz-dock-h) 0; display:grid; grid-template-columns:minmax(0,1fr) 150px; gap:16px; padding:8px; }
        .yfz-panel.all { grid-template-columns: minmax(0, 1fr); }
        .yfz-panel > .yfp-lb { position: static; max-height: none; height: 100%; overflow-y: auto; }
        .yfz-round { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
        .yfz-cards { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; overscroll-behavior: contain; }
        .yfz-cards .yfp-card { flex: 0 0 auto; }
        .yfz-cards .yfp-tbd { margin-top: 0; }
        /* Every game by master game #: a scrolling table inside the panel. */
        .yfz-all { height: 100%; overflow: auto; overscroll-behavior: contain; border: 1px solid var(--yfp-card-border); border-radius: 8px; background: var(--yfp-card-bg); }
        .yfz-all table { width: 100%; border-collapse: collapse; font: 500 12px/1.2 Oswald, sans-serif; color: var(--yfp-text); }
        .yfz-all thead th { position: sticky; top: 0; z-index: 1; padding: 6px 6px; background: var(--bg, #0c0c0c); color: var(--yfp-gold); font: 700 10px/1 Oswald, sans-serif; letter-spacing: .08em; text-transform: uppercase; text-align: center; border-bottom: 1px solid var(--yfp-card-border); }
        body.light-theme .yfz-all thead th { background: #f4efe6; }
        .yfz-all td { padding: 4px 6px; text-align: center; border-bottom: 1px solid var(--yfp-card-border); white-space: nowrap; }
        .yfz-all .t { text-align: left; max-width: 0; width: 34%; overflow: hidden; text-overflow: ellipsis; }
        .yfz-all th.t { text-align: left; }
        .yfz-all .no { color: var(--yfp-muted); font-variant-numeric: tabular-nums; }
        .yfz-all .st small { color: var(--yfp-muted); }
        .yfz-all .r { width: 26px; font-weight: 700; color: var(--yfp-strong); }
        .yfz-all td button { max-width: 100%; padding: 0; border: 0; background: transparent; color: var(--yfp-muted); font: inherit; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .yfz-all td button:disabled { cursor: default; }
        .yfz-all td button.won { color: var(--yfp-strong); }
        .yfz-all td button.me { color: var(--yfp-gold); font-weight: 700; }
        .yfz-all td button:not(:disabled):hover { text-decoration: underline; }
        .yfz-all tr.mine td { background: rgba(255,193,7,.08); }
        .yfz-all tr.live .no { color: var(--yfp-gold); }
        .yfz-all .tbd { color: var(--yfp-faint); }

        /* The round buttons, pinned above the footer ad like the profile's. */
        .yfz-dock { position: fixed; left: 0; right: 0; bottom: var(--footerH, 66px); height: var(--yfz-dock-h); z-index: 60; background: rgba(7,7,7,.98); border-top: 1px solid rgba(255,255,255,.12); box-shadow: 0 -6px 16px rgba(0,0,0,.42); }
        .yfz-dock-tabs { box-sizing: border-box; height: 100%; max-width: 900px; margin: 0 auto; padding: 0 4px; display: grid; }
        .yfz-tab { position: relative; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 4px 1px; border: 0; background: transparent; color: rgba(255,255,255,.66); cursor: pointer; -webkit-tap-highlight-color: transparent; }
        .yfz-tab b { font: 700 clamp(15px, 4.2vw, 20px)/1 Oswald, sans-serif; letter-spacing: .02em; }
        .yfz-tab span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 700 clamp(8px, 2.2vw, 10px)/1 Oswald, sans-serif; letter-spacing: .05em; text-transform: uppercase; color: rgba(255,255,255,.5); }
        .yfz-tab:hover, .yfz-tab.on { color: #fff; }
        .yfz-tab.on b { color: #d2b45c; }
        .yfz-tab.on::before { content: ''; position: absolute; left: 20%; right: 20%; top: 0; height: 3px; border-radius: 0 0 2px 2px; background: #d2b45c; }
        .yfz-tab.now span { color: var(--gold, #ffc107); }
        @media (max-width: 899px) {
          .yfz { --yfz-dock-h: 38px; }
          .yfz-panel { grid-template-columns:minmax(0,1fr) 88px; gap:7px; padding:5px 4px 4px 5px; }
          .yfz-dock-tabs { padding:0 2px; }
          .yfz-tab { gap:0; padding:2px 0; }
          .yfz-tab b { font-size:14px; line-height:1; }
          .yfz-tab span { display:none; }
          .yfz-tab.on::before { left:18%; right:18%; height:2px; }
          .yfz-cards { gap:4px; }
          .yfp-scorecard { border-radius:5px; }
          .yfp-score-head { font-size:5.6px; padding:2px 4px 1px; }
          .yfp-green-board { padding:4px 4px 3px; }
          .yfp-green-row { grid-template-columns:64px repeat(var(--inning-count,9),minmax(9px,1fr)) 22px; gap:1px; margin-top:1px; }
          .yfp-green-row.head { font-size:5.8px; }
          .yfp-green-abbr { display:none; }
          .yfp-green-full { display:block; font:800 7.3px/.95 var(--yfp-sb),"Arial Narrow",Oswald,sans-serif; letter-spacing:-.035em; text-overflow:clip; }
          .yfp-green-slot,.yfp-green-run { height:17px; font-size:9px; border-radius:2px; }
          .yfp-green-status { font-size:5.5px; padding:1px 2px; }
          .fgs-inline .ysv-actions button { min-height:28px !important; font-size:11px !important; gap:3px !important; }
          .fgs-inline .ysv-actions button i { font-size:13px !important; }
          .fgs-inline .ysv-actions { border-bottom:0; }
          .yfp-lb { font-size:7.5px; line-height:1.16; }
          .yfp-lb-sort { gap:1px; margin-bottom:4px; padding:0; }
          .yfp-lb-sort button { min-height:16px; font-size:6px; padding:0 1px; }
          .yfp-lb-group { margin-bottom:5px; }
          .yfp-lb-head { font-size:6.7px; }
          .yfp-lb li { grid-template-columns:11px minmax(0,1fr) auto; gap:2px; padding:.5px 0; }
          .yfp-lb li .rk { text-align:left; font-size:.8em; }
          .yfp-lb-note { display:none; }
          .yfp-lb-rules { min-height:20px; margin-top:6px; font-size:7px; }
          .yfz-all table { font-size: 11px; }
          .yfz-all td { padding: 4px 3px; }
          .yfz-all th:nth-child(3), .yfz-all td:nth-child(3) { display: none; }
        }

        /* Same as the player profile: Row 4 is visually absent, but its
           established height budget is NOT reassigned to Row 5. */
        @media (max-width:760px) {
          body:has(.yfz) { --row4-h:0px; }
          body:has(.yfz) .yat-row4-shell { display:none; }
          .yfz { min-height:0; }
        }

        /* The drawers: home from the right, visitor from the left. */
        /* Above the site's floating buttons, so nothing covers the close button. */
        .yfp-drawer-wrap { position: fixed; inset: 0; z-index: 2147483200; background: rgba(0,0,0,.45); }
        .yfp-drawer-wrap.row5 { bottom: var(--footerH, 66px); background: rgba(0,0,0,.3); }
        .bl.bl-embed.yfp-drawer { position: absolute; top: 0; bottom: 0; width: min(560px, 94vw); overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; padding: 0 0 24px; box-shadow: 0 0 30px rgba(0,0,0,.45); animation: yfp-in-r .22s ease-out; }
        .bl.bl-embed.yfp-drawer.right { right: 0; }
        .bl.bl-embed.yfp-drawer.left { left: 0; animation-name: yfp-in-l; }
        @keyframes yfp-in-r { from { transform: translateX(100%); } to { transform: none; } }
        @keyframes yfp-in-l { from { transform: translateX(-100%); } to { transform: none; } }
        @media (prefers-reduced-motion: reduce) { .bl.bl-embed.yfp-drawer { animation: none; } }
        .yfp-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 10px; padding: 6px 12px; background: var(--panel2); border-bottom: 1px solid var(--line); }
        .yfp-drawer-head div { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0; }
        .yfp-drawer-head .yfp-drawer-school { color: var(--text); font: 700 14px/1.1 "Roboto Condensed", "Arial Narrow", Oswald, sans-serif; letter-spacing: .02em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .yfp-drawer-head .yfp-drawer-location { color: var(--muted); font: 600 9px/1.15 Oswald, sans-serif; letter-spacing: .07em; text-transform: uppercase; }
        .yfp-drawer-head .yfp-drawer-game { margin-top: 1px; color: var(--gold); font: 700 10px/1.15 Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
        .yfp-drawer-head button { flex: none; width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 50%; background: transparent; color: var(--text); font-size: 15px; cursor: pointer; }
        .yfp-drawer .ybr-rules { padding: 14px; }
        .yfp-drawer-wait { padding: 20px 14px; color: var(--muted); }

        @media (max-width: 899px) {
          .bl.bl-embed.yfp-drawer { width: 100vw; }
          .yfp-drawer-head { padding: 6px 10px; }
          .yfp-drawer-head .yfp-drawer-school { font-size: 13px; }
          .yfp-drawer-head .yfp-drawer-location { font-size: 9px; }
          .yfp-drawer-head .yfp-drawer-game { font-size: 10px; }
          .yfp-lb-cols { grid-template-columns:16px minmax(0,1fr) auto; gap:3px; font-size:5.5px; }
          .yfp { padding: 8px 8px 16px; }
          .yfp-green-row { grid-template-columns:68px repeat(var(--inning-count,9),minmax(10px,1fr)) 24px; gap:1px; }
          .yfp-green-full { display:block; font:800 7.5px/.95 var(--yfp-sb),"Arial Narrow",Oswald,sans-serif; letter-spacing:-.035em; text-overflow:clip; }
          .yfp-green-place { font-size:5px; line-height:1; letter-spacing:.02em; }
          .yfp-green-abbr { display:none; }
          .yfp-green-slot,.yfp-green-run { height:18px; font-size:10px; }
          .yfp-green-row.head { font-size:6.5px; }
          .yfp-green-status { font-size:6px; padding:1px 3px; }
          .yfp-score-head { font-size:6px; padding:3px 4px 2px; }
          .yfp-layout { grid-template-columns:minmax(0,1fr) 92px; gap:16px; }
          .yfp-lb { font-size: 8px; }
          .yfp-lb li { grid-template-columns: 16px minmax(0,1fr) auto; gap: 3px; }
          .yfp-card { padding: 6px 8px 5px; }
          .yfp-box thead th:not(.tm):not(.r) { width: 13px; }
          .yfp-box { font-size: 12px; }
          .yfp-box .tm b { font-size: 13.5px; }
          .yfp-box .tm small { display: none; }
          .yfp-box .r { width: 28px; padding-right: 10px; font-size: 17px; }
          .yfp-box .tm button { gap: 4px; }
        }
      `}</style>
    </div>
  );
}
