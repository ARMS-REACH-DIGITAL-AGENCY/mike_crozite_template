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
  abbr, correctedRosterGame, fmtDate, fmtRange, loadActiveRoster, loadBoxes, loadIndex, loadLb, place, previewDate, rankRegion, shortName, standings,
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
    const boxPromise = card.file ? loadBoxes(card.file).then((all) => all[String(g[0])]).catch(() => undefined) : Promise.resolve(undefined);
    Promise.all([boxPromise, loadActiveRoster(g[2]), loadActiveRoster(g[3])])
      .then(([box, homeRoster, awayRoster]) => { if (!cancelled) setPreviewData({ box, homeRoster, awayRoster }); })
      .catch(() => { if (!cancelled) setPreviewData({ box: undefined, homeRoster: [], awayRoster: [] }); });
    return () => { cancelled = true; };
  }, [g, card.file]);
  const gameNo = ((card.week - 1) % 3) + 1;
  const round = Math.ceil(card.week / 3);
  const pill = card.state === 'final' ? 'FINAL' : card.state === 'live' ? (card.days ? `THRU ${DAY_NAMES[card.days - 1].toUpperCase()}` : 'LIVE') : card.state === 'next' ? fmtDate(index.weeks[card.week - 1][0]) : card.state === 'bye' ? 'BYE' : 'TBD';
  const corrected = g && previewData?.box
    ? correctedRosterGame(g[5], card.week, previewData.box.h?.p || [], previewData.box.a?.p || [], previewData.homeRoster, previewData.awayRoster)
    : null;
  const shownInnings = corrected?.innings || g?.[5] || [];
  const inningCount = Math.max(9, Math.floor(shownInnings.length / 2));
  const [rawHr, rawAr] = g ? runsThrough(g, card.days) : [0, 0];
  const [hr, ar] = corrected && card.state === 'final' ? corrected.score : [rawHr, rawAr];
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
function DrawerWrap({ onClose, children, dual = false, sides }: { onClose: () => void; children: React.ReactNode; dual?: boolean; sides: ('l' | 'r')[] }) {
  const [box, setBox] = useState<{ top: number } | null>(null);
  // Desktop: the drawers dock beside the game cards (body classes pad the
  // panel on those sides) rather than covering them, so the other school's
  // name stays visible and clickable.
  const sideKey = sides.join('');
  useEffect(() => {
    const cls = sideKey.split('').map((x) => `yfp-dock-${x}`);
    document.body.classList.add(...cls);
    return () => document.body.classList.remove(...cls);
  }, [sideKey]);
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
    <div className={`yfp-drawer-wrap${box ? ' row5' : ''}${dual ? ' dual' : ''}`} style={box ? { top: box.top } : undefined} role="presentation" onClick={box ? undefined : onClose}>
      {children}
    </div>,
    document.body,
  );
}

// A school's week in a drawer: every player's line, OPS+ and FIP-, and how
// each run was scored. Home from the right, visitor from the left.
function TeamDrawerPanel({ index, open, onClose }: { index: Index; open: Open; onClose: () => void }) {
  const { card, side } = open;
  const g = card.game!;
  const homeId = g[2], awayId = g[3];
  const [box, setBox] = useState<Record<string, GameBox> | null>(null);
  const [rosters, setRosters] = useState<{ home: ActiveRosterPlayer[]; away: ActiveRosterPlayer[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (card.file) loadBoxes(card.file).then((b) => { if (!cancelled) setBox(b); }).catch(() => { if (!cancelled) setBox({}); });
    Promise.all([loadActiveRoster(homeId), loadActiveRoster(awayId)])
      .then(([home, away]) => { if (!cancelled) setRosters({ home, away }); })
      .catch(() => { if (!cancelled) setRosters({ home: [], away: [] }); });
    return () => { cancelled = true; };
  }, [card.file, homeId, awayId]);
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
  const played = card.state === 'final';
  const [hr, ar] = played ? runsThrough(g, 7) : [0, 0];
  return (
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
  );
}

function TeamDrawer({ index, open, onClose }: { index: Index; open: Open; onClose: () => void }) {
  return (
    <DrawerWrap onClose={onClose} sides={[open.side === 'h' ? 'r' : 'l']}>
      <TeamDrawerPanel index={index} open={open} onClose={onClose} />
    </DrawerWrap>
  );
}

// A maximized desktop screen: both schools' Stat Ledgers at once - the
// visitor from the left, home from the right - with the game cards still
// visible (and usable) between them.
function DualTeamDrawers({ index, open, onClose }: { index: Index; open: Open; onClose: () => void }) {
  return (
    <DrawerWrap onClose={onClose} dual sides={['l', 'r']}>
      <TeamDrawerPanel index={index} open={{ card: open.card, side: 'a' }} onClose={onClose} />
      <TeamDrawerPanel index={index} open={{ card: open.card, side: 'h' }} onClose={onClose} />
    </DrawerWrap>
  );
}

// True while the window is at least `px` wide.
function useMinWidth(px: number) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${px}px)`);
    const sync = () => setOk(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [px]);
  return ok;
}

// The rules, in a drawer from the right.
function RulesDrawer({ onClose }: { onClose: () => void }) {
  return (
    <DrawerWrap onClose={onClose} sides={['r']}>
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
  const myRegion = index.schools[me]?.[1] || 1;
  const [region, setRegion] = useState<number>(myRegion);
  const [order, setOrder] = useState<'rank' | 'az'>('rank');
  const through = Math.min(final, LAST_WEEK);
  const boards = useMemo(() => {
    const st = standings(index, lb, through);
    return Object.keys(REGIONS).map((k) => ({ region: Number(k), ranked: rankRegion(index, st, Number(k)) }));
  }, [index, lb, through]);
  const board = boards.find((x) => x.region === region) || boards[0];
  const rows = useMemo(() => {
    const ranked = board.ranked.map((s, i) => ({ s, place: i + 1 }));
    if (order === 'rank') return ranked;
    return [...ranked].sort((x, y) => shortName(index.schools[x.s.h]?.[0] || '').localeCompare(shortName(index.schools[y.s.h]?.[0] || '')));
  }, [board, order, index]);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Bring this school's line into view (inside the list only).
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const row = list.querySelector<HTMLElement>('li.me');
    list.scrollTop = row ? row.offsetTop - list.clientHeight / 3 : 0;
  }, [region, order]);
  const diff = (s: { rf: number; ra: number }) => `${s.rf - s.ra >= 0 ? '+' : ''}${s.rf - s.ra}`;
  return (
    <aside className="yfp-lb" aria-label="Most Runs Scored Leaderboards">
      <div className="yfp-lb-top">
        <div className="yfp-lb-title" title={`${through ? `Thru week ${through}` : 'Starts week 1'} · runs, then run differential`}>
          Most Runs <span>|</span> Season Leaderboard
        </div>
        <div className="yfp-lb-sort" role="group" aria-label="Order">
          <button type="button" className={order === 'rank' ? 'on' : ''} aria-pressed={order === 'rank'} onClick={() => setOrder('rank')}>Standings</button>
          <button type="button" className={order === 'az' ? 'on' : ''} aria-pressed={order === 'az'} onClick={() => setOrder('az')}>A–Z</button>
        </div>
      </div>
      <div className="yfp-lb-regions" role="tablist" aria-label="Regions">
        <span className="yfp-lb-regions-k" aria-hidden="true">Regions</span>
        {boards.map((x) => (
          <button key={x.region} type="button" role="tab" aria-selected={x.region === region}
            aria-label={`Region ${x.region} · ${REGIONS[x.region]}`} title={`Region ${x.region} · ${REGIONS[x.region]}`}
            className={`${x.region === region ? 'on' : ''}${x.region === myRegion ? ' mine' : ''}`}
            onClick={() => setRegion(x.region)}>
            {x.region}
          </button>
        ))}
      </div>
      <div className="yfp-lb-list" ref={listRef}>
        <ol>{rows.map(({ s, place }) => (
          <li key={s.h} className={s.h === me ? 'me' : ''} title={`${index.schools[s.h]?.[0]} · seed #${index.schools[s.h]?.[2] ?? '—'} in Region ${region} · leaderboard #${place} · ${s.rf} runs (${diff(s)})`}>
            <span className="rk">{order === 'rank' ? place : (index.schools[s.h]?.[2] ?? '—')}</span>
            <a href={`/${s.h}#sec-fantasy`}>{shortName(index.schools[s.h]?.[0] || '')}</a>
            <span className="rf">{s.rf}</span>
          </li>
        ))}</ol>
      </div>
      <button type="button" className="yfp-lb-rules" onClick={onRules}>Rules · how it&apos;s scored</button>
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

// From this width both Stat Ledger drawers open together (about a third of
// the screen each), leaving ~600px of game cards between them.
const DUAL_DRAWER_MIN_WIDTH = 1420;

export default function SchoolBracket({ hsid }: { hsid: string }) {
  const me = Number(hsid);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState<Index | null>(null);
  const [lb, setLb] = useState<LbGame[] | null>(null);
  const [error, setError] = useState('');
  const [asof, setAsof] = useState('');
  const [open, setOpen] = useState<Open | null>(null);
  // One set of drawers at a time: a Stat Ledger opening closes the site's
  // drawers (account, menu, favorites...), and a site drawer opening
  // closes the Stat Ledgers - so the game never gets squeezed between both.
  const openStats = (o: Open | null) => {
    if (o) {
      document.body.classList.remove('drawer-open', 'drawer-left-open', 'drawer-right-open', 'drawer-account-open',
        'drawer-favorites-open', 'drawer-sort-open', 'yat-left-search-mode', 'yat-desktop-docked-drawers');
      ['drawerAccount', 'drawerMask'].forEach((id) => document.getElementById(id)?.classList.remove('open', 'is-open', 'active'));
    }
    setOpen(o);
  };
  useEffect(() => {
    if (!open) return;
    const siteDrawer = () => ['drawer-left-open', 'drawer-right-open', 'drawer-account-open', 'drawer-favorites-open', 'drawer-sort-open']
      .some((c) => document.body.classList.contains(c));
    const mo = new MutationObserver(() => { if (siteDrawer()) setOpen(null); });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, [open]);
  const bothDrawers = useMinWidth(DUAL_DRAWER_MIN_WIDTH);
  // Desktop with Stat Ledgers open: the Most Runs leaderboard as a sheet
  // from the bottom, between the drawers (its column is hidden then).
  const [rules, setRules] = useState(false);
  const [focused, setFocused] = useState(0);
  // The round's games show one at a time (Game 1 / 2 / 3 tabs). null = the
  // round's current game: live, else next, else the last one played.
  const [gameWeek, setGameWeek] = useState<number | null>(null);
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

  // A hero click/focus also changes the canonical stage.
  useEffect(() => {
    if(!nav.focusSeq||!nav.focusWeek) return;
    const key=stageKeyForWeek(nav.focusWeek);
    const on=window.setTimeout(()=>{selectStage(key);setFocused(nav.focusWeek);setGameWeek(nav.focusWeek);},0);
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
    setGameWeek(card.week);
    requestAnimationFrame(()=>document.getElementById(`fweek-${card.week}`)?.scrollIntoView({block:'nearest'}));
  },[cards]);

  const school = index?.schools[me];
  const cur = tabs.find((t) => t.key === tab);
  const curList = cur?.list || [];
  let gameIdx = gameWeek != null ? curList.findIndex((c) => c.week === gameWeek) : -1;
  if (gameIdx < 0) gameIdx = curList.findIndex((c) => c.state === 'live');
  if (gameIdx < 0) gameIdx = curList.findIndex((c) => c.state === 'next');
  if (gameIdx < 0) curList.forEach((c, i) => { if (c.state === 'final') gameIdx = i; });
  if (gameIdx < 0) gameIdx = 0;
  const shownCard = curList[gameIdx];

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
                <PostseasonStage stage={tab} index={index} me={me} cal={cal} rec={rec} onOpen={openStats} />
              ) : (
                <div className="yfz-cards">
                  {curList.length > 1 && (
                    <div className="yfz-game-tabs" role="tablist" aria-label="Games">
                      {curList.map((c, i) => (
                        <button key={c.week} type="button" role="tab" aria-selected={i === gameIdx}
                          className={`yfz-game-tab${i === gameIdx ? ' on' : ''}${c.state === 'live' ? ' live' : ''}`}
                          onClick={() => setGameWeek(c.week)}>
                          <b>Game {i + 1}</b><span>{dates(index, c.week)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {shownCard && <WeekCardView key={shownCard.week} index={index} card={shownCard} me={me} star={stars?.[shownCard.week]} starIdentity={stars?.[shownCard.week]?identities[stars[shownCard.week][5]]:undefined} rec={rec} focused={focused===shownCard.week} onOpen={openStats}/>}
                  {cur&&curList.length===0?<p className="yfp-empty">No game for this school in this stage.</p>:null}
                  {!school&&<p className="yfp-empty">This school isn&apos;t one of the 1,024 in the 2026 bracket.</p>}
                </div>
              )}
            </div>
            <RegionColumn index={index} lb={lb} me={me} final={cal.final} onRules={()=>setRules(true)}/>
          </div>
        </div>
      )}
      {index && open && (bothDrawers
        ? <DualTeamDrawers index={index} open={open} onClose={() => setOpen(null)} />
        : <TeamDrawer index={index} open={open} onClose={() => setOpen(null)} />)}
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
        @media (min-width:600px) {
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
        .yfp-lb-sort { display: flex; gap: 2px; margin: 0 0 4px; padding: 0; }
        .yfp-lb-sort button { flex: 1; min-height: 18px; padding: 0 2px; border: 1px solid var(--yfp-card-border); border-radius: 2px; background: var(--yfp-card-bg); color: var(--yfp-muted); font: 700 7px/1 Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
        .yfp-lb-sort button.on { border-color: var(--yfp-gold); color: var(--yfp-gold); }
        .yfp-lb ol { margin: 0; padding: 0; list-style: none; }
        .yfp-lb li { display: grid; grid-template-columns: 22px minmax(0,1fr) auto; gap: 4px; padding: 1px 0; }
        .yfp-lb li .rk { color: var(--yfp-faint); text-align: right; font-size: .9em; }
        .yfp-lb li a { color: inherit; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .yfp-lb li a:hover { color: var(--yfp-gold); text-decoration: underline; }
        .yfp-lb li .rf { color: var(--yfp-muted); font-variant-numeric: tabular-nums; }
        .yfp-lb li.me, .yfp-lb li.me .rf, .yfp-lb li.me .rk { color: var(--yfp-gold); font-weight: 700; }
        .yfp-lb-rules { display: block; width: 100%; margin: 10px 0 0; min-height: 26px; border: 1px solid var(--yfp-gold); border-radius: 4px; background: transparent; color: var(--yfp-gold); font: 600 9px/1 Oswald, sans-serif; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; }

        /* The FunZone: exactly the screen under rows 1-4, above the footer
           ad and the pinned round buttons - one round at a time, no page
           scrolling (like the profile's FunZone). */
        .yfp:has(.yfz) { padding: 0; }
        .yfz { --yfz-dock-h:0px; position:relative; height:calc(100dvh - var(--row1-h,36px) - var(--row2-h,54px) - var(--row3-h,100px) - var(--row4-h,56px) - var(--footerH,66px)); min-height:318px; max-height:none; overflow:hidden; }
        .yfz-panel { position:absolute; inset:0 0 var(--yfz-dock-h) 0; display:grid; grid-template-columns:minmax(0,1fr) 150px; gap:16px; padding:8px; }
        .yfz-panel.all { grid-template-columns: minmax(0, 1fr); }
        .yfz-panel > .yfp-lb { position: static; max-height: none; height: 100%; overflow-y: auto; }
        .yfz-round { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
        .yfz-cards { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; overscroll-behavior: contain; }
        .yfz-cards .yfp-card { flex: 0 0 auto; }
        .yfz-cards .yfp-tbd { margin-top: 0; }

        /* Desktop: a full-width scoreboard you can read at 100%, its
           like/comment/share row underneath (not squeezed beside it), a
           standings column wide enough to read, and Stat Ledger drawers
           wide enough for every column. */
        @media (min-width:600px) {
          .yfz-cards { gap:12px; align-items:center; }
          .yfp-game-split { display:block; min-height:0; }
          .yfp-game-scorepane { overflow:visible; border-right:0; border-bottom:1px solid var(--yfp-card-border); }
          .yfp-game-socialpane { padding:4px 12px 8px; overflow:visible; }
          .yfp-game-socialpane .fgs-inline.ysv-post { height:auto; }
          .yfp-game-socialpane .fgs-inline .ysv-comments { max-height:180px; }
          .yfp-score-head { padding:5px 12px 4px; font-size:11px; }
          .yfp-green-board { padding:8px 12px 10px; }
          /* One grid for the whole board (rows are subgrids), so the name
             column is exactly as wide as the longest school name - each name
             sits right beside inning 1 - and the board is centered. */
          .yfp-game-scorepane .yfp-green-board {
            display:grid;
            grid-template-columns:minmax(0,max-content) repeat(var(--inning-count,9),clamp(20px,6cqw,40px)) clamp(32px,8.5cqw,56px);
            column-gap:clamp(2px,.5cqw,4px);
            justify-content:center;
          }
          .yfp-game-scorepane .yfp-green-row {
            grid-column:1 / -1;
            display:grid;
            grid-template-columns:subgrid;
            width:auto;
            max-width:none;
            margin-top:4px;
          }
          /* The board scales with the card (like the flip-card gallery): it
             fills a wide card and shrinks smoothly in a narrow one. */
          .yfp-game-scorepane .yfp-green-team { padding-right:clamp(4px,1.6cqw,10px); }
          .yfp-game-scorepane .yfp-green-row.head { margin-top:0; font-size:clamp(10px,2.2cqw,14px); }
          .yfp-game-scorepane .yfp-green-status { font-size:clamp(8px,1.6cqw,10px); padding:3px 6px 2px; }
          .yfp-game-scorepane .yfp-green-slot,
          .yfp-game-scorepane .yfp-green-run { height:clamp(22px,6cqw,40px); font-size:clamp(11px,3cqw,20px); border-radius:4px; }
          .yfp-game-scorepane .yfp-green-run { font-size:clamp(13px,3.6cqw,23px); }
          .yfp-game-scorepane .yfp-green-run i { right:-12px; font-size:11px; }
          .yfp-game-scorepane .yfp-green-full { font-size:clamp(12px,2.9cqw,18px); letter-spacing:0; }
          .yfp-game-scorepane .yfp-green-place { margin-top:3px; font-size:9px; }

          /* The standings column. scrollbar-gutter keeps the scrollbar in its
             own lane so it never covers the run totals. */
          .yfz-panel { grid-template-columns:minmax(0,1fr) 250px; }
          .yfz-panel > .yfp-lb { scrollbar-gutter:stable; padding-right:4px; }
          .yfp-lb { font-size:13px; line-height:1.4; }
          .yfp-lb-title { font-size:12px; }
          .yfp-lb-sort button { min-height:26px; font-size:11px; }
          .yfp-lb li { grid-template-columns:34px minmax(0,1fr) 30px; gap:6px; padding:2px 0; }
          .yfp-lb li .rf { text-align:right; }
          .yfp-lb-rules { min-height:32px; font-size:11px; }

        }
        /* Stat Ledger drawers are as wide as their tables need (470px) and
           dock beside the game from 860px: no dimming, clicks pass through
           to the game. Both open (1420px and up): if there's more room than
           the game's 680px, the drawers take it, so they stay flush. */
        @media (min-width:860px) {
          body { --yfp-dw:470px; }
          .bl.bl-embed.yfp-drawer { width:var(--yfp-dw); }
          .yfp-drawer-wrap.row5 { background:transparent; pointer-events:none; }
          .yfp-drawer-wrap.row5 .bl.bl-embed.yfp-drawer { pointer-events:auto; }
        }
        @media (min-width:1420px) {
          body { --yfp-dw:max(470px, calc((100vw - 680px) / 2)); }
        }
        /* Pills - the same size as the flip cards' (ACTIVE / CLASS OF ...):
           Game 1/2/3, the regions, Standings/A-Z, Rules. The selected one is
           filled, not outlined in color. */
        .yfz-game-tab, .yfz-panel .yfp-lb-sort button, .yfz-panel .yfp-lb-rules {
          display:inline-flex; align-items:center; justify-content:center; gap:5px; min-height:0; width:auto; margin:0;
          padding:3px 10px; border:1px solid rgba(255,255,255,.15); border-radius:20px; background:rgba(0,0,0,.5);
          color:rgba(255,255,255,.62); font:700 10px/1.2 Oswald,sans-serif; letter-spacing:.04em; text-transform:uppercase;
          white-space:nowrap; cursor:pointer;
        }
        .yfz-game-tab b { font:inherit; color:#fff; }
        .yfz-game-tab span { font:inherit; letter-spacing:inherit; color:inherit; }
        .yfz-game-tab:hover, .yfz-panel .yfp-lb-sort button:hover, .yfz-panel .yfp-lb-rules:hover { color:#fff; }
        .yfz-game-tab.on, .yfz-panel .yfp-lb-sort button.on {
          background:rgba(255,255,255,.16); border-color:rgba(255,255,255,.3); color:#fff;
        }
        .yfz-game-tab.on b { color:var(--yfp-gold,#d2b45c); }
        .yfz-game-tab.live:not(.on) b::after { content:' · live'; color:#e2786a; }
        .yfz-game-tabs { flex:none; display:flex; flex-wrap:wrap; justify-content:center; gap:6px; }
        body.light-theme .yfz-game-tab,
        body.light-theme .yfz-panel .yfp-lb-sort button, body.light-theme .yfz-panel .yfp-lb-rules {
          background:rgba(255,255,255,.7); border-color:rgba(0,0,0,.15); color:rgba(0,0,0,.6);
        }
        body.light-theme .yfz-game-tab b { color:#111; }

        /* Every screen: one middle column - the game tabs and the game on
           top, the Most Runs Scored leaderboard always right under it, one
           region at a time. The column scrolls if the screen is short. */
        .yfz-panel,
        body.yfp-dock-l .yfz-panel,
        body.yfp-dock-r .yfz-panel {
          grid-template-columns:min(100%, 680px); grid-template-rows:max-content minmax(280px,1fr);
          justify-content:center; row-gap:10px; padding:8px; overflow-y:auto; overscroll-behavior:contain;
        }
        .yfz-panel.all { grid-template-columns:min(100%, 680px); grid-template-rows:minmax(0,1fr) minmax(280px,1fr); }
        .yfz-panel > .yfz-round { grid-row:1; container-type:inline-size; }
        .yfz-cards { overflow:visible; scrollbar-width:none; }
        .yfz-cards::-webkit-scrollbar { display:none; }
        .yfz-cards > * { width:100%; }
        .yfz-panel > .yfp-lb,
        body.yfp-dock-l .yfz-panel > .yfp-lb,
        body.yfp-dock-r .yfz-panel > .yfp-lb {
          grid-row:2; display:flex; flex-direction:column; min-height:0; height:auto; max-height:none; position:static; overflow:hidden;
          padding:8px 10px; border:1px solid var(--yfp-card-border); border-radius:8px;
          background:var(--yfp-card-bg); font:400 13px/1.4 system-ui,sans-serif;
        }
        .yfp-lb-top { flex:none; display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
        .yfz-panel .yfp-lb-title { align-self:center; font-size:12px; white-space:nowrap; }
        .yfz-panel .yfp-lb-title span { margin:0 4px; color:var(--yfp-faint,rgba(255,255,255,.3)); font-weight:400; }
        .yfz-panel .yfp-lb-sort { flex:none; display:flex; gap:4px; width:auto; margin:0; }
        /* Regions 1-8: manila-folder tabs on the list's top edge; the open
           one joins the list. */
        .yfp-lb-regions { flex:none; display:flex; align-items:flex-end; gap:3px; margin:8px 0 6px; border-bottom:1px solid rgba(255,255,255,.2); }
        .yfp-lb-regions-k { margin-right:6px; padding-bottom:5px; color:var(--yfp-muted); font:700 10px/1 Oswald,sans-serif; letter-spacing:.1em; text-transform:uppercase; }
        .yfp-lb-regions button { position:relative; margin-bottom:-1px; min-width:30px; padding:4px 9px 3px; border:1px solid rgba(255,255,255,.2); border-bottom-color:transparent;
          border-radius:7px 7px 0 0; background:rgba(255,255,255,.05); color:rgba(255,255,255,.55); font:700 12px/1 Oswald,sans-serif; cursor:pointer; }
        .yfp-lb-regions button:hover { color:#fff; }
        .yfp-lb-regions button.mine { color:var(--yfp-gold,#d2b45c); }
        .yfp-lb-regions button.on { padding-top:6px; background:var(--yfp-card-bg); border-bottom-color:var(--yfp-card-bg); color:#fff; }
        .yfp-lb-regions button.on.mine { color:var(--yfp-gold,#d2b45c); }
        body.light-theme .yfp-lb-regions { border-bottom-color:rgba(0,0,0,.2); }
        body.light-theme .yfp-lb-regions button { border-color:rgba(0,0,0,.2); border-bottom-color:transparent; background:rgba(0,0,0,.04); color:rgba(0,0,0,.55); }
        body.light-theme .yfp-lb-regions button.on { background:var(--yfp-card-bg); border-bottom-color:var(--yfp-card-bg); color:#111; }
        .yfz-panel .yfp-lb-list { position:relative; flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; scrollbar-gutter:stable; }
        .yfz-panel .yfp-lb-list ol { column-count:2; column-gap:24px; }
        .yfz-panel .yfp-lb li { grid-template-columns:30px minmax(0,1fr) 30px; gap:6px; padding:2px 0; break-inside:avoid; }
        .yfz-panel .yfp-lb li .rk { font-size:.85em; }
        .yfz-panel .yfp-lb li .rf { text-align:right; }
        .yfz-panel .yfp-lb-rules { flex:none; align-self:center; margin-top:8px; }
        @media (max-width:599px) {
          .yfz-panel, body.yfp-dock-l .yfz-panel, body.yfp-dock-r .yfz-panel { padding:5px; row-gap:6px; grid-template-rows:max-content minmax(240px,1fr); }
          .yfz-panel .yfp-lb-list ol { column-count:1; }
          .yfz-panel > .yfp-lb { font-size:12px; }
        }
        /* From 860px, like the flip-card gallery: the game (up to 680px)
           sits centered with no drawer, and when one opens it slides over
           and sits right against it, shrinking only if the room left is
           narrower than 680px; with both open it fills the space between
           them, flush on both sides. */
        @media (min-width:860px) {
          .yfz-panel,
          body.yfp-dock-l .yfz-panel,
          body.yfp-dock-r .yfz-panel {
            grid-template-columns:minmax(0,1fr); justify-content:stretch;
            padding-left:max(8px, calc((100% - 680px) / 2)); padding-right:max(8px, calc((100% - 680px) / 2));
            transition:padding-left .22s ease-out, padding-right .22s ease-out;
          }
          body.yfp-dock-l .yfz-panel { padding-left:var(--yfp-dw); padding-right:max(8px, calc(100% - var(--yfp-dw) - 680px)); }
          body.yfp-dock-r .yfz-panel { padding-right:var(--yfp-dw); padding-left:max(8px, calc(100% - var(--yfp-dw) - 680px)); }
          body.yfp-dock-l.yfp-dock-r .yfz-panel { padding-left:var(--yfp-dw); padding-right:var(--yfp-dw); }
        }
        @media (prefers-reduced-motion: reduce) { .yfz-panel { transition:none !important; } }
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
          .yfz-dock-tabs { padding:0 2px; }
          .yfz-tab { gap:0; padding:2px 0; }
          .yfz-tab b { font-size:14px; line-height:1; }
          .yfz-tab span { display:none; }
          .yfz-tab.on::before { left:18%; right:18%; height:2px; }
        }
        @media (max-width: 599px) {
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
        /* No row 4 on this tab: row 5 takes its height. */
        body:has(.yat-row4-off) { --row4-h:0px; }
        .yat-row4-shell.yat-row4-off { display:none; }

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

        @media (max-width: 859px) {
          .bl.bl-embed.yfp-drawer { width: min(470px, 100vw); }
          .yfp-drawer-head { padding: 6px 10px; }
          .yfp-drawer-head .yfp-drawer-school { font-size: 13px; }
          .yfp-drawer-head .yfp-drawer-location { font-size: 9px; }
          .yfp-drawer-head .yfp-drawer-game { font-size: 10px; }
        }
        @media (max-width: 599px) {
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
