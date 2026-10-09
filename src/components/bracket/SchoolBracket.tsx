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

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type ActiveRosterPlayer, type GameBox, type GameRow, type Index, type LbGame,
  LAST_WEEK, LBT_ROUNDS, REGIONS, WORLD_SERIES, Face, Styles,
  StatsDot, abbr, correctedRosterGame, fmtDate, fmtRange, loadActiveRoster, loadBoxes, loadIndex, loadLb, place, previewDate, rankRegion, shortName, standings,
} from './gallery';
import { type CurrentPlayerIdentity, type Star, type WeekCard, calendar, loadCurrentPlayerIdentities, loadStars, masterGames, records, liveBoard, runsThrough, schoolSeason, starLine } from './schoolSeason';
import { type FantasyStageKey, selectStage, stageKeyForWeek, useBracketNav } from './bracketNav';
import BracketRules from './BracketRules';
import PostseasonStage from './PostseasonStage';
import FantasyGameSocial from './FantasyGameSocial';
import { getSchoolCrestUrl } from '@/lib/schoolAssets';
import { Roboto_Condensed } from 'next/font/google';
import { TEST_BRACKET } from '@/lib/bracket/testSeason';

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

// The gold header: ROUND n | GAME 1 | GAME 2 | GAME 3 | WEEK n | dates -
// the game tabs pick which of the round's games the card shows.
type GamePick = { weeks: number[]; onPick: (week: number) => void };
function ScoreHead({ index, card, games }: { index: Index; card: WeekCard; games?: GamePick }) {
  const round = Math.ceil(card.week / 3);
  const weeks = games?.weeks.length ? games.weeks : [card.week];
  return (
    <div className="yfp-score-head yfp-score-head-tabs">
      <b>Round {round}</b>
      <i aria-hidden="true">|</i>
      <span className="yfp-score-games" role="tablist" aria-label="Games">
        {weeks.map((w, i) => (
          <button key={w} type="button" role="tab" aria-selected={w === card.week} className={w === card.week ? 'on' : ''}
            onClick={() => games?.onPick(w)} disabled={!games}>
            Game {((w - 1) % 3) + 1 || i + 1}
          </button>
        ))}
      </span>
      <span className="yfp-score-dates">Week {card.week} <i aria-hidden="true">|</i> {dates(index, card.week)}</span>
    </div>
  );
}

function WeekCardView({ index, card, me, star, starIdentity, rec, focused, onOpen, domId, games }: {
  index: Index; card: WeekCard; me: number; star?: Star; starIdentity?: CurrentPlayerIdentity; rec: (h: number, week: number) => string; focused: boolean; onOpen: (o: Open) => void; domId?: string; games?: GamePick;
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
  // A live game's inning ("TOP 2") and its yellow, not-yet-final cells.
  const lv = card.state === 'live' && g ? liveBoard(g) : null;
  const pill = card.state === 'final' ? 'FINAL' : lv ? lv.status : card.state === 'live' ? 'LIVE' : card.state === 'next' ? fmtDate(index.weeks[card.week - 1][0]) : card.state === 'bye' ? 'BYE' : 'TBD';
  const corrected = g && previewData?.box
    ? correctedRosterGame(g[5], card.week, previewData.box.h?.p || [], previewData.box.a?.p || [], previewData.homeRoster, previewData.awayRoster)
    : null;
  const shownInnings = corrected?.innings || g?.[5] || [];
  // Extra innings (a tiebreak) only once the game is final: a week still
  // being played is 9 innings, whatever the practice files carry.
  const inningCount = card.state === 'final' ? Math.max(9, Math.floor(shownInnings.length / 2)) : 9;
  const [rawHr, rawAr] = g ? runsThrough(g, card.days) : [0, 0];
  const [hr, ar] = corrected && card.state === 'final' ? corrected.score : [rawHr, rawAr];
  const correctedWinner = g && corrected && card.state === 'final'
    ? (corrected.score[0] === corrected.score[1] ? g[6] : corrected.score[0] > corrected.score[1] ? g[2] : g[3])
    : g?.[6] ?? null;
  const played = card.state === 'final' || card.state === 'live';

  if (!g) {
    // A future game: the opponent is TBD (decided by earlier rounds), this
    // school is home. Both names open the Stat Ledgers.
    const tbdRow = (side: 'a' | 'h') => {
      const mine = side === 'h';
      const rawName = mine ? (S[me]?.[0] || '') : '';
      const name = mine ? shortName(rawName) : 'TBD';
      const location = mine ? place(rawName) : 'Opponent to be determined';
      return (
        <div className={`yfp-green-row${mine ? ' me' : ''}`} key={side}>
          <button type="button" className="yfp-green-team" onClick={() => onOpen({ card, side })}
            aria-label={`${name}: this week's players`}>
            <span className="yfp-green-abbr">{mine ? abbr(name) : 'TBD'}</span>
            <span className="yfp-green-full">{name}</span>
            <span className="yfp-green-place">{location}</span>
          </button>
          {Array.from({ length: 9 }, (_, i) => <span key={i} className="yfp-green-slot" />)}
          <span className="yfp-green-run" />
          <StatsDot name={name} onOpen={() => onOpen({ card, side })} />
        </div>
      );
    };
    const scoreboard = (
      <>
        <ScoreHead index={index} card={card} games={games} />
        <div className="yfp-green-board" style={{ '--inning-count': 9 } as React.CSSProperties}>
          <div className="yfp-green-row head">
            <span className="yfp-green-status tbd">UPCOMING</span>
            {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => <span key={n}>{n}</span>)}
            <span className="run">R</span>
            <span className="stats">DAILY<br />STATS</span>
          </div>
          {tbdRow('a')}
          {tbdRow('h')}
          <BoardCrest id={me} side="r" />
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
        <button type="button" className="yfp-green-team" onClick={() => onOpen({ card, side })}
          aria-label={`${name}: this week's players`}>
          <span className="yfp-green-abbr">{abbr(name)}</span>
          <span className="yfp-green-full">{name}</span>
          {location ? <span className="yfp-green-place">{location}</span> : null}
        </button>
        {Array.from({ length: inningCount }, (_, i) => i).map((i) => {
          if (lv) {
            const c = lv.cells[side === 'a' ? 0 : 1][i];
            return <span key={i} className={`yfp-green-slot${c.v ? ' scored' : ''}${c.now ? ' now' : ''}`}>{c.v}</span>;
          }
          const shown = card.state === 'final' || (card.state === 'live' && i < Math.min(card.days, 9));
          const value = shownInnings[i * 2 + off] || 0;
          return <span key={i} className={`yfp-green-slot${shown && value ? ' scored' : ''}`}>{shown ? value : ''}</span>;
        })}
        <span className="yfp-green-run">{played ? runs : ''}{won ? <i aria-label="winner">◀</i> : null}</span>
        <StatsDot name={name} onOpen={() => onOpen({ card, side })} />
      </div>
    );
  };

  const scoreboard = (
    <>
      <ScoreHead index={index} card={card} games={games} />
      <div className="yfp-green-board" style={{ '--inning-count': inningCount } as React.CSSProperties}>
        <div className="yfp-green-row head">
          <span className={`yfp-green-status ${card.state}`}>{pill}</span>
          {Array.from({ length: inningCount }, (_, i) => i + 1).map((n) => <span key={n}>{n}</span>)}
          <span className="run">R</span>
          <span className="stats">DAILY<br />STATS</span>
        </div>
        {row('a')}
        {row('h')}
        <BoardCrest id={g[3]} side="l" />
        <BoardCrest id={g[2]} side="r" />
      </div>
    </>
  );

  const social = g ? (
    <FantasyGameSocial
      gameKey={`sim-2026:${g[0]}`}
      title={`Round ${round} · Game ${gameNo}`}
      subtitle={`${shortName(S[g[3]]?.[0] || '')} ${ar} · ${shortName(S[g[2]]?.[0] || '')} ${hr}`}
      shareText={`Follow the YAT?STATS High School Alumni Fantasy Game between ${shareSchoolLabel(S[g[3]]?.[0] || '')} and ${shareSchoolLabel(S[g[2]]?.[0] || '')}.`}
      shareUrl={typeof window === 'undefined' ? '' : `${window.location.origin}${window.location.pathname}?fantasyGame=${g[0]}&week=${card.week}${corrected && card.state === 'final' ? `&scoreInnings=${corrected.innings.join(',')}` : ''}#sec-fantasy`}
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

// A school's crest beside the main scoreboard, screened back (visitors left,
// home right). Only on a card wide enough to have room for it; a school
// without a crest image shows nothing.
function BoardCrest({ id, side }: { id: number; side: 'l' | 'r' }) {
  const [gone, setGone] = useState(false);
  if (!id || gone) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`yfp-board-crest ${side}`} src={getSchoolCrestUrl(id)} alt="" aria-hidden="true" onError={() => setGone(true)} />;
}

// Where a drawer opens: on desktop only over row 5 (the timeline and the
// ticker stay in view above it, the footer ad below); on a phone the whole
// screen.
function DrawerWrap({ onClose, children, dual = false, sides }: { onClose: () => void; children: React.ReactNode; dual?: boolean; sides: ('l' | 'r')[] }) {
  const [box, setBox] = useState<{ top: number; mobile?: boolean } | null>(null);
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
    // Never over row 1: the drawers start below the site's top bar.
    const place = () => {
      const row5 = document.querySelector('.yfz') || document.querySelector('.yat-row5-shell');
      const bar = document.querySelector('.yat-topbar');
      const below = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
      setBox(window.matchMedia('(min-width: 900px)').matches && row5 ? { top: Math.max(below, row5.getBoundingClientRect().top) } : { top: below, mobile: true });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place); };
  }, []);
  // Docked: drop each drawer's day tabs (M ... Weekly Totals) onto the line
  // of the Season Runs Leaderboard's region tabs (1-8, A-Z) beside them. The drawer
  // starts where the game card starts, so the drop is the leaderboard tabs'
  // depth below the card less the day tabs' own depth in the drawer.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const docked = Boolean(box && !box.mobile);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!docked || !wrap) return;
    let raf = 0;
    const align = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const card = document.querySelector('.yfz-cards .yfp-card');
        const lb = document.querySelector('.yfz-panel .yfp-lb-regions button');
        const cards = document.querySelector('.yfz-cards');
        let drop = 0;
        for (const drawer of wrap.querySelectorAll<HTMLElement>('.yfp-drawer')) {
          const tabs = drawer.querySelector<HTMLElement>('.bl-inning-tabs button');
          // Measure only at rest (nothing scrolled), where the line is defined.
          if (!card || !lb || !tabs || drawer.scrollTop || cards?.scrollTop) return;
          const cur = parseFloat(getComputedStyle(wrap).getPropertyValue('--yfp-tabs-drop')) || 0;
          // Tab centers on one line (the two rows of tabs differ by a pixel or two).
          const mid = (r: DOMRect) => r.top + r.height / 2;
          const want = (mid(lb.getBoundingClientRect()) - card.getBoundingClientRect().top)
            - (mid(tabs.getBoundingClientRect()) - drawer.getBoundingClientRect().top - cur);
          drop = Math.max(drop, Math.round(want));
        }
        wrap.style.setProperty('--yfp-tabs-drop', `${Math.max(0, drop)}px`);
      });
    };
    align();
    const mo = new MutationObserver(align);
    mo.observe(wrap, { childList: true, subtree: true });
    window.addEventListener('resize', align);
    return () => { cancelAnimationFrame(raf); mo.disconnect(); window.removeEventListener('resize', align); };
  }, [docked]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div ref={wrapRef} className={`yfp-drawer-wrap${box && !box.mobile ? ' row5' : ''}${dual ? ' dual' : ''}`} style={box ? { top: box.top } : undefined} role="presentation" onClick={box && !box.mobile ? undefined : onClose}>
      {children}
    </div>,
    document.body,
  );
}

// A school's week in a drawer: every player's line, OPS+ and FIP-, and how
// each run was scored. Home from the right, visitor from the left.
// A future game with no opponent yet: this school at home v TBD (id 0).
const tbdGame = (card: WeekCard, me: number): GameRow => [0, card.week, me, 0, '', [], null];

function TeamDrawerPanel({ index, open, me, onClose, onSwitch }: { index: Index; open: Open; me: number; onClose: () => void; onSwitch?: () => void }) {
  const { card, side } = open;
  const g = card.game ?? tbdGame(card, me);
  const homeId = g[2], awayId = g[3];
  const [box, setBox] = useState<Record<string, GameBox> | null>(null);
  const [rosters, setRosters] = useState<{ home: ActiveRosterPlayer[]; away: ActiveRosterPlayer[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (card.file) loadBoxes(card.file).then((b) => { if (!cancelled) setBox(b); }).catch(() => { if (!cancelled) setBox({}); });
    const roster = (id: number) => (id ? loadActiveRoster(id) : Promise.resolve([] as ActiveRosterPlayer[]));
    Promise.all([roster(homeId), roster(awayId)])
      .then(([home, away]) => { if (!cancelled) setRosters({ home, away }); })
      .catch(() => { if (!cancelled) setRosters({ home: [], away: [] }); });
    return () => { cancelled = true; };
  }, [card.file, homeId, awayId]);
  const S = index.schools;
  const h = side === 'h' ? homeId : awayId;
  const drawerSchool = h ? drawerSchoolParts(S[h]?.[0] || '') : { school: 'TBD', location: 'Opponent to be determined' };
  const nameOf = (id: number) => (id ? shortName(S[id]?.[0] || '') : 'TBD');
  const stageGameNo = Number(card.stage.match(/Game\s+(\d+)/i)?.[1] || 1);
  const drawerGameLabel = card.week <= 30
    ? `ROUND ${Math.ceil(card.week / 3)} - GAME ${((card.week - 1) % 3) + 1}`
    : card.week === 31
      ? `CHAMPIONSHIP ROUND 1 - GAME ${stageGameNo}`
      : card.week === 32
        ? `CHAMPIONSHIP ROUND 2 - GAME ${stageGameNo}`
        : card.week === 33
          ? 'CHAMPIONSHIP GAME'
          : 'YAT?STATS WORLD SERIES';
  // Staged simulation: the drawer only shows results once the week's games
  // are final. Before that it's the empty Day-1 state (no leaked sim data).
  // Live: a week in progress shows its days so far.
  const played = card.state === 'final' || (card.state === 'live' && card.days > 0);
  const [hr, ar] = played ? runsThrough(g, card.state === 'final' ? 7 : card.days) : [0, 0];
  // The drawer opens on today's tab during the week (Monday = 0), else on the week.
  const weekStart = index.weeks[card.week - 1]?.[0];
  const todayIdx = weekStart ? Math.round((Date.parse(`${previewDate()}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86400000) : -1;
  const openDay: 'week' | number = todayIdx >= 0 && todayIdx <= 6 ? todayIdx : 'week';
  return (
      <aside className={`bl bl-embed yfp-drawer ${side === 'h' ? 'right' : 'left'}`} role="dialog" aria-modal="true"
        aria-label={`${nameOf(h)}, week ${card.week}`} onClick={(e) => e.stopPropagation()}>
        <div className="yfp-drawer-head yfp-drawer-head-line">
          <span className="yfp-drawer-who">
            <b className="yfp-drawer-school">{nameOf(h)}</b>
            {drawerSchool.location ? <><i aria-hidden="true">|</i><span className="yfp-drawer-location">{drawerSchool.location}</span></> : null}
          </span>
          <span className="yfp-drawer-game">{drawerGameLabel}</span>
          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <Face side={side} label={card.stage} week={card.week} dates={dates(index, card.week)} home={homeId} away={awayId}
          names={[nameOf(homeId), nameOf(awayId)]}
          locations={[homeId ? place(S[homeId]?.[0] || '') : '', awayId ? place(S[awayId]?.[0] || '') : '']}
          score={[hr, ar]} innings={played ? g[5] : []} winner={played ? g[6] : null}
          decidedBy={played ? g[4] : ''} box={played && box ? box[String(g[0])] : undefined} loading={!rosters}
          homeRoster={rosters?.home} awayRoster={rosters?.away} drawerMode played={played} onSwitchSide={onSwitch} openDay={openDay} />
      </aside>
  );
}

function TeamDrawer({ index, open, me, onClose, onSwitch }: { index: Index; open: Open; me: number; onClose: () => void; onSwitch: () => void }) {
  return (
    <DrawerWrap onClose={onClose} sides={[open.side === 'h' ? 'r' : 'l']}>
      <TeamDrawerPanel index={index} open={open} me={me} onClose={onClose} onSwitch={onSwitch} />
    </DrawerWrap>
  );
}

// A maximized desktop screen: both schools' Stat Ledgers at once - the
// visitor from the left, home from the right - with the game cards still
// visible (and usable) between them.
function DualTeamDrawers({ index, open, me, onClose }: { index: Index; open: Open; me: number; onClose: () => void }) {
  return (
    <DrawerWrap onClose={onClose} dual sides={['l', 'r']}>
      <TeamDrawerPanel index={index} open={{ card: open.card, side: 'a' }} me={me} onClose={onClose} />
      <TeamDrawerPanel index={index} open={{ card: open.card, side: 'h' }} me={me} onClose={onClose} />
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
// Leaderboards through the last final week (live: through this week's days so far) - all 8 regions, or every school
// A-Z (like the teammates' A-Z / Year). Opens on this school.
function RegionColumn({ index, lb, me, final, onRules }: { index: Index; lb: LbGame[]; me: number; final: number; onRules: () => void }) {
  const myRegion = index.schools[me]?.[1] || 1;
  // A region (1-8), most runs first - or 'az': the whole field A-Z.
  const [view, setView] = useState<number | 'az'>(myRegion);
  const through = Math.min(final, LAST_WEEK);
  const boards = useMemo(() => {
    const st = standings(index, lb, through);
    return Object.keys(REGIONS).map((k) => ({ region: Number(k), ranked: rankRegion(index, st, Number(k)) }));
  }, [index, lb, through]);
  const rows = useMemo(() => {
    const nm = (h: number) => shortName(index.schools[h]?.[0] || '');
    if (view === 'az') {
      return boards.flatMap((b) => b.ranked.map((s, i) => ({ s, place: i + 1, region: b.region })))
        .sort((x, y) => nm(x.s.h).localeCompare(nm(y.s.h)));
    }
    const b = boards.find((x) => x.region === view) || boards[0];
    return b.ranked.map((s, i) => ({ s, place: i + 1, region: b.region }));
  }, [boards, view, index]);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Bring this school's line into view (inside the list only).
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const row = list.querySelector<HTMLElement>('li.me');
    list.scrollTop = row ? row.offsetTop - list.clientHeight / 3 : 0;
  }, [view]);
  // The run column sits right after the longest school name (with its
  // city) in the WHOLE field - one spot, the same for every region.
  const fieldNames = useMemo(() => boards.flatMap((b) => b.ranked.map((x) => index.schools[x.h]?.[0] || '')), [boards, index]);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const fit = () => {
      list.style.removeProperty('--lb-name-w');
      const li = list.querySelector('li');
      if (!li || !fieldNames.length) return;
      // Measure every school's name + city once, in a hidden copy of a row.
      const probe = document.createElement('ol');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;column-count:1';
      probe.innerHTML = fieldNames.map(() => '<li><a><span></span><small></small></a></li>').join('');
      [...probe.querySelectorAll('a')].forEach((a, i) => {
        a.querySelector('span')!.textContent = shortName(fieldNames[i]);
        a.querySelector('small')!.textContent = place(fieldNames[i]);
      });
      list.appendChild(probe);
      const textW = (el: HTMLElement) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; };
      const longest = Math.max(...[...probe.querySelectorAll<HTMLElement>('a')].map(textW));
      probe.remove();
      const cs = getComputedStyle(li);
      const gap = parseFloat(cs.columnGap || '0');
      const lcs = getComputedStyle(list);
      // The rank (A-Z: region-seed) column fits its header label too.
      const rkHead = list.querySelector<HTMLElement>('.yfp-lb-hcol .rk');
      const rankW = Math.ceil(Math.max(view === 'az' ? 44 : 24, rkHead ? textW(rkHead) + 8 : 0));
      list.style.setProperty('--lb-rank-w', `${rankW}px`);
      // ... and the runs column fits TOTAL RUNS.
      const rfHead = list.querySelector<HTMLElement>('.yfp-lb-hcol .rf');
      const runsW = Math.ceil(Math.max(22, rfHead ? textW(rfHead) + 8 : 0));
      list.style.setProperty('--lb-runs-w', `${runsW}px`);
      // The name column is the longest name in every region, so the runs sit
      // in the same place in each.
      const avail = list.clientWidth - parseFloat(lcs.paddingLeft) - parseFloat(lcs.paddingRight);
      const nameW = Math.ceil(Math.min(longest + 2, avail - rankW - runsW - 2 * gap));
      list.style.setProperty('--lb-name-w', `${nameW}px`);
      // A school and its runs are one group: the list takes as many columns
      // of those groups as fit (one when two won't), up to 3, each with its
      // own header.
      const colW = rankW + nameW + runsW + 2 * gap;
      const cols = window.matchMedia('(max-width: 599px)').matches ? 1 : Math.max(1, Math.min(3, Math.floor((avail + 22) / (colW + 22))));
      list.style.setProperty('--lb-cols', String(cols));
      list.dataset.cols = String(cols);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(list);
    return () => ro.disconnect();
  }, [fieldNames, view]);
  const diff = (s: { rf: number; ra: number }) => `${s.rf - s.ra >= 0 ? '+' : ''}${s.rf - s.ra}`;
  return (
    <aside className="yfp-lb" aria-label="Most Runs Scored Leaderboards">
      <div className="yfp-lb-regions" role="tablist" aria-label="Most Runs Scored · Season Leaderboard">
        <span className="yfp-lb-title" title={`${through ? `Thru week ${through}` : 'Starts week 1'} · runs, then run differential`}>
          Season Runs Leaderboard <i>|</i> <span className="yfp-lb-regions-k" aria-hidden="true">Regions</span>
        </span>
        {boards.map((x) => (
          <button key={x.region} type="button" role="tab" aria-selected={x.region === view}
            aria-label={`Region ${x.region} · ${REGIONS[x.region]}`} title={`Region ${x.region} · ${REGIONS[x.region]}`}
            className={`${x.region === view ? 'on' : ''}${x.region === myRegion ? ' mine' : ''}`}
            onClick={() => setView(x.region)}>
            <span>{x.region}</span>
          </button>
        ))}
        <button type="button" role="tab" aria-selected={view === 'az'} className={`az${view === 'az' ? ' on' : ''}`}
          title="The whole field, A-Z" onClick={() => setView('az')}><span>A–Z</span></button>
      </div>
      <div className={`yfp-lb-list${view === 'az' ? ' az' : ''}`} ref={listRef}>
        {/* The gold header row, one over each column the list shows. */}
        <div className="yfp-lb-head" aria-hidden="true">
          {[0, 1, 2].map((c) => (
            <div key={c} className="yfp-lb-hcol">
              <span className="rk">{view === 'az' ? 'Region # - Seed #' : 'Rank'}</span>
              <span className="nm">School</span>
              <span className="rf">Total Runs</span>
            </div>
          ))}
        </div>
        <ol>{rows.map(({ s, place: rank, region }) => (
          <li key={s.h} className={s.h === me ? 'me' : ''} title={`${index.schools[s.h]?.[0]} · seed #${index.schools[s.h]?.[2] ?? '—'} in Region ${region} · #${rank} in the region · ${s.rf} runs (${diff(s)})`}>
            <span className="rk">{view === 'az' ? `R${region}-S${index.schools[s.h]?.[2] ?? '—'}` : rank}</span>
            <a href={`/${s.h}#sec-fantasy`}>{shortName(index.schools[s.h]?.[0] || '')}<small>{place(index.schools[s.h]?.[0] || '')}</small></a>
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
const DUAL_DRAWER_MIN_WIDTH = 1240;
// From this width the site's docked drawers (Search on the left, Favorites
// on the right) open beside the Stat Ledgers instead of closing them: each
// ledger moves in by the site drawer's width and the game narrows to fit.
const SIDE_BY_SIDE_MIN_WIDTH = 1860;
const DOCKED_SITE_DRAWERS = ['drawer-left-open', 'drawer-favorites-open'];
const OTHER_SITE_DRAWERS = ['drawer-right-open', 'drawer-account-open', 'drawer-sort-open'];
const sideBySide = () => typeof window !== 'undefined' && window.matchMedia(`(min-width: ${SIDE_BY_SIDE_MIN_WIDTH}px)`).matches;
// A site drawer that should close the Stat Ledgers (any of them on a
// narrower screen; only the undocked ones - account, sort - on a wide one).
const blockingSiteDrawerOpen = () => [...OTHER_SITE_DRAWERS, ...(sideBySide() ? [] : DOCKED_SITE_DRAWERS)]
  .some((c) => document.body.classList.contains(c));

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
  // Wide screens open both Stat Ledgers for the game on the board; they
  // close when the screen narrows past that and come back when it widens -
  // unless the fan closed them (or opened a site drawer).
  const autoOpened = useRef(false);
  const keepClosed = useRef(false);
  const closeStats = () => { keepClosed.current = true; autoOpened.current = false; setOpen(null); };
  const openStats = (o: Open | null) => {
    autoOpened.current = false;
    if (o) {
      // Wide screens keep a docked Search or Favorites drawer open beside them.
      const keepDocked = sideBySide() && DOCKED_SITE_DRAWERS.some((c) => document.body.classList.contains(c));
      document.body.classList.remove(...OTHER_SITE_DRAWERS, ...(keepDocked ? [] : ['drawer-open', ...DOCKED_SITE_DRAWERS, 'yat-left-search-mode', 'yat-desktop-docked-drawers']));
      ['drawerAccount', 'drawerMask'].forEach((id) => document.getElementById(id)?.classList.remove('open', 'is-open', 'active'));
    }
    setOpen(o);
  };
  useEffect(() => {
    if (!open) return;
    const mo = new MutationObserver(() => { if (blockingSiteDrawerOpen()) { keepClosed.current = true; autoOpened.current = false; setOpen(null); } });
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
  const shownWeek = shownCard?.week ?? 0;
  useEffect(() => {
    const t = window.setTimeout(() => {
      const siteDrawerOpen = blockingSiteDrawerOpen();
      if (bothDrawers && shownCard && !keepClosed.current && !siteDrawerOpen) {
        if (!open || (autoOpened.current && open.card.week !== shownCard.week)) {
          autoOpened.current = true;
          setOpen({ card: shownCard, side: 'h' });
        }
      } else if (!bothDrawers && autoOpened.current && open) {
        autoOpened.current = false;
        setOpen(null);
      }
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bothDrawers, shownWeek, !!open]);

  // Desktop: the bracket fills the screen from where it starts down to the
  // ticker - measured, since the rows above it (the hero is 200px on a
  // desktop, not the --row3-h guess) vary with the page.
  const yfzRef = useRef<HTMLDivElement | null>(null);
  const hasYfz = Boolean(index && lb && cal);
  useLayoutEffect(() => {
    const el = yfzRef.current;
    if (!el) return;
    const fit = () => {
      if (!window.matchMedia('(min-width: 600px)').matches) { el.style.removeProperty('height'); return; }
      const foot = document.querySelector('.yat-footer');
      const bottom = foot ? foot.getBoundingClientRect().top + window.scrollY : window.innerHeight + window.scrollY;
      el.style.height = `${Math.max(318, Math.floor(bottom - (el.getBoundingClientRect().top + window.scrollY)))}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    for (const q of ['.yat-row1-shell', '.yat-row2-shell', '.yat-row3-shell', '.yat-footer']) {
      const x = document.querySelector(q);
      if (x) ro.observe(x);
    }
    window.addEventListener('resize', fit);
    const later = [300, 1500].map((ms) => window.setTimeout(fit, ms));
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); later.forEach((t) => window.clearTimeout(t)); };
  }, [hasYfz]);

  return (
    <div className={`yfp ${scoreboardFont.variable}`}>
      <div ref={sentinel} className="yfp-top" />
      {error && <p className="yfp-empty">Could not load the bracket ({error}).</p>}
      {index && lb && cal && (
        <div className="yfz" ref={yfzRef}>
          <div className="yfz-panel">
            <div className="yfz-round">
              {tab === 'c1' || tab === 'c2' || tab === 'cg' || tab === 'yws' ? (
                <PostseasonStage stage={tab} index={index} me={me} cal={cal} rec={rec} onOpen={openStats} />
              ) : (
                <div className="yfz-cards">
                  {shownCard && <WeekCardView key={shownCard.week} index={index} card={shownCard} me={me} star={stars?.[shownCard.week]} starIdentity={stars?.[shownCard.week]?identities[stars[shownCard.week][5]]:undefined} rec={rec} focused={focused===shownCard.week} onOpen={openStats}
                    games={curList.length > 1 ? { weeks: curList.map((c) => c.week), onPick: setGameWeek } : undefined}/>}
                  {cur&&curList.length===0?<p className="yfp-empty">No game for this school in this stage.</p>:null}
                  {!school&&<p className="yfp-empty">This school isn&apos;t in test bracket {TEST_BRACKET}. That bracket&apos;s 16 schools are in the leaderboard below.</p>}
                </div>
              )}
            </div>
            <RegionColumn index={index} lb={lb} me={me} final={cal.days ? Math.max(cal.final, cal.week) : cal.final} onRules={()=>setRules(true)}/>
          </div>
        </div>
      )}
      {index && open && (bothDrawers
        ? <DualTeamDrawers index={index} open={open} me={me} onClose={closeStats} />
        : <TeamDrawer index={index} open={open} me={me} onClose={closeStats}
            onSwitch={() => setOpen((o) => (o ? { card: o.card, side: o.side === 'h' ? 'a' : 'h' } : o))} />)}
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
        .yfp-score-head { display:flex; justify-content:space-between; gap:6px; padding:3px 6px 2px; border-radius:5px; background:#2e8b5f; color:#fff; font:700 7px/1 var(--yfp-sb),"Arial Narrow",Oswald,sans-serif; letter-spacing:.035em; text-transform:uppercase; }
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
        /* The inning being played, and runs not yet final: yellow, like a
           ballpark board until the half-inning is over. */
        .yfp-green-slot.now { color:#ffd34f; }
        /* Board crests show only on a wide card (see the container query). */
        .yfp-board-crest { display:none; }
        .yfp-green-run { position:relative; height:20px; display:grid; place-items:center; border-radius:3px; background:#0d2d20; color:#ffd34f; font:800 13px/1 Oswald,sans-serif; }
        .yfp-green-row.won .yfp-green-run { background:#f3c735; color:#15251d; }
        .yfp-green-run i { position:absolute; right:-7px; color:#fff; font-style:normal; font-size:8px; }
        /* Main scoreboard, every width: school names flush right against the
           innings - SCHOOL in caps, City, ST as written. */
        .yfp-game-scorepane .yfp-green-team { text-align:right; }
        .yfp-game-scorepane .yfp-green-full { text-transform:uppercase; }
        .yfp-game-scorepane .yfp-green-place { text-transform:none; letter-spacing:.02em; }
        /* The daily-stats button: its own column right of R (an implicit
           grid column, so every board's template gets it). */
        .yfp-green-row { grid-auto-columns:24px; }
        .yfp-green-row>.yfp-green-stats, .yfp-green-row>.yfp-green-stats-cell, .yfp-green-row.head>.stats { grid-column:-1 / span 1; grid-row:1; }
        /* "DAILY / STATS", stacked and centered over the stats button (which
           sits at the right of its column, clear of the winner arrow). */
        .yfp-green-row.head .stats { color:#ffd34f; font-size:.72em; letter-spacing:.02em; line-height:1.1; justify-self:end; width:15px; }
        .yfp-green-stats { justify-self:end; width:15px; height:15px; display:grid; place-items:center; padding:0; border:1px solid rgba(255,211,79,.8); border-radius:50%;
          background:#0d2d20; color:#ffd34f; font-size:9px; line-height:1; cursor:pointer; transition:background .15s, color .15s, transform .15s; }
        .yfp-green-stats svg { width:62%; height:62%; fill:currentColor; }
        .yfp-green-stats:hover, .yfp-green-stats:focus-visible { background:#ffd34f; color:#15251d; transform:scale(1.08); }
        .yfp-green-stats:focus-visible { outline:2px solid #fff; outline-offset:1px; }
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
          .yfp-game-scorepane { overflow:visible; border-right:0; border-bottom:0; }
          .yfp-game-socialpane { padding:0 12px 2px; overflow:visible; }
          .yfp-game-socialpane .fgs-inline .ysv-actions button { min-height:28px; font-size:13px; }
          /* No stroke around the game card. */
          .yfz-cards .yfp-card.yfp-scorecard { border-color:transparent; }
          .yfp-game-socialpane .fgs-inline.ysv-post { height:auto; }
          .yfp-game-socialpane .fgs-inline .ysv-comments { max-height:180px; }
          .yfp-score-head { padding:5px 12px 4px; font-size:11px; }
          .yfp-green-board { padding:8px 12px 10px; }
          /* One grid for the whole board (rows are subgrids), so the name
             column is exactly as wide as the longest school name - each name
             sits right beside inning 1 - and the board is centered. */
          /* Inset under the gold row with rounded corners, and as tall as a
             drawer's two boards (6px below the gold row to 138px below it),
             so all three boards start and end on the same lines. */
          /* Every header row is an inset, rounded bar over its board. */
          .yfz-cards .yfp-scorecard .yfp-score-head { margin:0 8px; }
          /* School crests either side of the board, screened back, once the
             card is wide enough to hold them beside it (hidden otherwise). */
          .yfp-game-scorepane { container-type:inline-size; }
          .yfp-game-scorepane .yfp-green-board { position:relative; }
          @container (min-width: 900px) {
            .yfp-game-scorepane .yfp-board-crest { display:block; position:absolute; top:50%; transform:translateY(-50%); height:84%; max-width:15%; object-fit:contain; opacity:.16; pointer-events:none; }
            .yfp-game-scorepane .yfp-board-crest.l { left:16px; }
            .yfp-game-scorepane .yfp-board-crest.r { right:16px; }
          }
          .yfp-game-scorepane .yfp-green-board {
            box-sizing:border-box; height:132px; margin:6px 8px 0; padding-top:0; padding-bottom:0; align-content:center;
            border:1px solid rgba(255,255,255,.12); border-radius:7px; box-shadow:inset 0 1px 8px rgba(0,0,0,.28);
            display:grid;
            grid-template-columns:max-content repeat(var(--inning-count,9),minmax(14px,36px)) minmax(34px,52px) 44px;
            column-gap:3px;
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
          /* The board is always the same height; only the inning columns
             narrow and widen with the card, up to 36px. */
          .yfp-game-scorepane .yfp-green-team { padding-right:10px; }
          .yfp-game-scorepane .yfp-green-full { overflow:hidden; text-overflow:ellipsis; }
          .yfp-game-scorepane .yfp-green-row.head { margin-top:0; font-size:13px; }
          .yfp-game-scorepane .yfp-green-status { font-size:10px; padding:3px 6px 2px; }
          .yfp-game-scorepane .yfp-green-slot,
          .yfp-game-scorepane .yfp-green-run { height:36px; font-size:18px; border-radius:4px; }
          .yfp-game-scorepane .yfp-green-run { font-size:21px; }
          .yfp-game-scorepane .yfp-green-run i { right:-12px; font-size:11px; }
          .yfp-game-scorepane .yfp-green-row>.yfp-green-stats, .yfp-game-scorepane .yfp-green-row>.yfp-green-stats-cell, .yfp-game-scorepane .yfp-green-row.head>.stats { grid-column:auto; grid-row:auto; }
          .yfp-game-scorepane .yfp-green-stats { width:26px; height:26px; font-size:15px; border-width:1.5px; }
          .yfp-game-scorepane .yfp-green-row.head .stats { font-size:9px; width:26px; }
          .yfp-game-scorepane .yfp-green-full { font-size:17px; letter-spacing:0; }
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
        /* Stat Ledger drawers are as wide as their tables plus a 12px lane
           for the drawer's own scrollbar (a Mac's overlay scrollbar would
           otherwise sit on the OPS column), and dock beside the game from
           820px: no dimming, clicks pass through to the game. */
        @media (min-width:820px) {
          body { --yfp-dw:422px; }
          .yfp-drawer-wrap .bl.bl-embed.yfp-drawer { width:var(--yfp-dw); scrollbar-width:thin; }
          .yfp-drawer-wrap .bl.bl-embed.yfp-drawer .bl-stat-block { padding-right:12px; }
          .yfp-drawer-wrap.row5 { background:transparent; pointer-events:none; }
          .yfp-drawer-wrap.row5 .bl.bl-embed.yfp-drawer { pointer-events:auto; }
          /* Docked drawers start where the game card starts, so the three
             gold headers sit on one line. */
          .yfp-drawer-wrap.row5 .bl.bl-embed.yfp-drawer { top:9px; }
          .yfp-drawer-wrap.row5 .bl.bl-embed.yfp-drawer .bl-history-tabs.bl-inning-tabs { margin-top:calc(4px + var(--yfp-tabs-drop, 0px)); }
        }
        /* Wide screens: a docked Search (left) or Favorites (right) drawer
           sits at the edge and the Stat Ledger on that side moves in beside it. */
        @media (min-width:1860px) {
          body.drawer-open.drawer-left-open .yfp-drawer-wrap.row5 { left:var(--yat-left-drawer-w, 290px); }
          body.drawer-open.drawer-favorites-open .yfp-drawer-wrap.row5 { right:var(--yat-right-drawer-w, 360px); }
        }
        /* The Rules pill: the flip cards' pill size. */
        .yfz-panel .yfp-lb-rules {
          display:inline-flex; align-items:center; justify-content:center; min-height:0; width:auto;
          padding:3px 10px; border:1px solid rgba(255,255,255,.15); border-radius:20px; background:rgba(0,0,0,.5);
          color:rgba(255,255,255,.62); font:700 10px/1.2 Oswald,sans-serif; letter-spacing:.04em; text-transform:uppercase; cursor:pointer;
        }
        .yfz-panel .yfp-lb-rules:hover { color:#fff; }
        body.light-theme .yfz-panel .yfp-lb-rules { background:rgba(255,255,255,.7); border-color:rgba(0,0,0,.15); color:rgba(0,0,0,.6); }

        /* The gold header: ROUND n | GAME 1 | GAME 2 | GAME 3 | WEEK n | dates. */
        .yfp-score-head.yfp-score-head-tabs { justify-content:flex-start; align-items:center; flex-wrap:wrap; gap:4px 8px; }
        @media (min-width:600px) { .yfp-score-head.yfp-score-head-tabs { box-sizing:border-box; height:23px; padding-top:0; padding-bottom:0; } }
        .yfp-score-head-tabs i { font-style:normal; opacity:.45; }
        .yfp-score-games { display:inline-flex; gap:2px; }
        .yfp-score-games button { padding:2px 6px 1px; border:0; border-radius:3px; background:transparent; color:inherit; opacity:.65;
          font:inherit; letter-spacing:inherit; text-transform:inherit; cursor:pointer; }
        .yfp-score-games button:hover:not(:disabled) { opacity:1; }
        .yfp-score-games button.on { opacity:1; background:#ffd34f; color:#123d29; }
        .yfp-score-games button:disabled { cursor:default; }
        .yfp-score-dates { margin-left:auto; white-space:nowrap; }
        .yfp-score-dates i { margin:0 4px; }

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
          padding:8px 10px; border:0; border-radius:0;
          background:transparent; font:400 13px/1.4 system-ui,sans-serif;
        }
        .yfz-panel .yfp-lb-title { align-self:auto; margin-right:4px; padding-bottom:0; font-size:11px; line-height:1; white-space:nowrap; }
        .yfz-panel .yfp-lb-title i { margin:0 4px; font-style:normal; color:var(--yfp-faint,rgba(255,255,255,.3)); font-weight:400; }
        /* Regions 1-8: manila-folder tabs on the list's top edge; the open
           one joins the list. */
        .yfp-lb-regions { flex:none; display:flex; flex-wrap:nowrap; align-items:baseline; gap:3px; margin:0 0 6px; border-bottom:1px solid rgba(255,255,255,.2); }
        .yfp-lb-regions > * { flex:none; white-space:nowrap; }
        .yfp-lb-regions-k { color:var(--yfp-muted); font-size:.85em; font-weight:700; letter-spacing:.1em; text-transform:uppercase; }
        .yfp-lb-regions button { position:relative; margin-bottom:-1px; min-width:26px; padding:4px 7px 3px; border:1px solid rgba(255,255,255,.2); border-bottom-color:transparent;
          border-radius:7px 7px 0 0; background:rgba(255,255,255,.05); color:rgba(255,255,255,.55); font:700 12px/1 Oswald,sans-serif; cursor:pointer; }
        .yfp-lb-regions button:hover { color:#fff; }
        .yfp-lb-regions button.on { padding-top:6px; background:var(--yfp-card-bg); border-bottom-color:var(--yfp-card-bg); color:var(--yfp-gold,#d2b45c); }
        /* Every tab - 1 to 8 and A-Z - is one size; the open one rises 2px. */
        .yfp-lb-regions button { display:inline-flex; align-items:flex-end; justify-content:center; box-sizing:border-box; line-height:1; padding-bottom:4px !important;
          flex:1 1 0; width:auto; min-width:14px; height:20px; padding:0; text-align:center; }
        .yfp-lb-regions button.on { height:22px; padding:0; }
        .yfp-lb-regions button.az { margin-left:4px; font-size:9px; letter-spacing:-.02em; }
        body.light-theme .yfp-lb-regions { border-bottom-color:rgba(0,0,0,.2); }
        body.light-theme .yfp-lb-regions button { border-color:rgba(0,0,0,.2); border-bottom-color:transparent; background:rgba(0,0,0,.04); color:rgba(0,0,0,.55); }
        body.light-theme .yfp-lb-regions button.on { background:var(--yfp-card-bg); border-bottom-color:var(--yfp-card-bg); color:#8a6a10; }
        /* The leaderboard has no box now: the open tab joins the page itself. */
        .yfz-panel .yfp-lb-regions button.on,
        body.light-theme .yfz-panel .yfp-lb-regions button.on { background:var(--bg,#0c0c0c); border-bottom-color:var(--bg,#0c0c0c); }
        .yfz-panel .yfp-lb-regions button.on { color:#ffd34f; }
        body.light-theme .yfz-panel .yfp-lb-regions button.on { color:#1f6b45; }
        .yfz-panel .yfp-lb-list { position:relative; flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; scrollbar-gutter:stable; padding-right:10px; }
        /* As many columns as fit, up to 3 (a region will have 128 schools): the
           count (--lb-cols) is set where the names are measured. */
        .yfz-panel .yfp-lb-list ol { column-count:var(--lb-cols, 1); column-gap:22px; }
        /* The gold header row (the drawers' stat header gold and type), one
           per column, pinned to the top of the list as it scrolls. */
        .yfz-panel .yfp-lb-head { position:sticky; top:0; z-index:2; display:grid; grid-template-columns:repeat(var(--lb-cols, 1), minmax(0,1fr)); column-gap:22px; margin-bottom:3px; background:var(--bg,#0c0c0c); }
        .yfz-panel .yfp-lb-hcol { display:grid; grid-template-columns:var(--lb-rank-w, 24px) var(--lb-name-w, minmax(0,1fr)) var(--lb-runs-w, 22px); gap:5px; align-items:center; height:20px; border-radius:5px; background:#2e8b5f; color:#ffd34f;
          font:700 11px/1 "Roboto Condensed","Arial Narrow",Oswald,sans-serif; letter-spacing:.035em; text-transform:uppercase; white-space:nowrap; }
        /* RANK and TOTAL RUNS centered over their columns; SCHOOL left. The
           numbers under them sit in a centered 3-digit box, right-aligned, so
           ones, tens and hundreds line up. */
        .yfz-panel .yfp-lb-hcol .rk, .yfz-panel .yfp-lb-hcol .rf { justify-self:center; }
        .yfz-panel .yfp-lb-list[data-cols="1"] .yfp-lb-hcol:nth-child(n+2),
        .yfz-panel .yfp-lb-list[data-cols="2"] .yfp-lb-hcol:nth-child(n+3) { display:none; }
        .yfz-panel .yfp-lb li { grid-template-columns:var(--lb-rank-w, 24px) var(--lb-name-w, minmax(0,1fr)) var(--lb-runs-w, 22px); gap:5px; padding:2px 0; break-inside:avoid; }
        .yfz-panel .yfp-lb li .rk, .yfz-panel .yfp-lb li .rf { justify-self:center; width:3ch; text-align:right; font-variant-numeric:tabular-nums; }
        /* A-Z: the region-seed (R3-S15) centered under its header label. */
        .yfz-panel .yfp-lb-list.az li .rk { width:auto; text-align:center; }
        .yfz-panel .yfp-lb li a small { margin-left:6px; color:var(--yfp-muted); font-size:.78em; font-weight:400; }
        /* School names in the drawers' player-name type (system-ui 11px). */
        .yfz-panel .yfp-lb li { font-size:11px; }
        .yfz-panel .yfp-lb li a small { font-size:.85em; }
        .yfz-panel .yfp-lb li .rk { font-size:.85em; }
        .yfz-panel .yfp-lb li .rf { text-align:right; }
        .yfz-panel .yfp-lb-rules { flex:none; align-self:center; margin-top:8px; }
        @media (max-width:599px) {
          .yfz-panel, body.yfp-dock-l .yfz-panel, body.yfp-dock-r .yfz-panel { padding:5px; row-gap:6px; grid-template-rows:max-content minmax(240px,1fr); }
          .yfz-panel .yfp-lb-list ol { column-count:1; }
          .yfz-panel .yfp-lb-title { font-size:9px; letter-spacing:.02em; margin-right:0; padding-bottom:0; }
          .yfz-panel .yfp-lb-title i { margin:0 3px; }
          .yfp-lb-regions-k { letter-spacing:.04em; }
          .yfp-lb-regions { gap:1px; }
          .yfz-panel .yfp-lb-regions button { flex:1 1 0; width:auto; min-width:14px; height:18px; padding:0; font-size:10.5px; }
          .yfz-panel .yfp-lb-regions button.on { height:20px; }
          .yfz-panel .yfp-lb-regions button.az { margin-left:2px; font-size:6.5px; letter-spacing:-.04em; }
          .yfz-panel > .yfp-lb, body.yfp-dock-l .yfz-panel > .yfp-lb, body.yfp-dock-r .yfz-panel > .yfp-lb { padding:8px 6px; font-size:12px; }
        }
        @media (max-width:374px) {
          .yfz-panel .yfp-lb-title { font-size:8.5px; letter-spacing:0; }
          .yfz-panel .yfp-lb-title i { margin:0 2px; }
          .yfp-lb-regions-k { letter-spacing:0; }
        }
        /* From 820px, like the flip-card gallery: the game (up to 680px)
           sits centered with no drawer, and when one opens it slides over
           and sits right against it, shrinking only if the room left is
           narrower than 680px; with both open (1240px and up) it fills all
           the space between them, flush on both sides, and the board grows
           with it. */
        @media (min-width:820px) {
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
          .yfp-score-head.yfp-score-head-tabs { font-size:9px; padding:3px 5px 2px; gap:2px 5px; }
          .yfp-score-games button { padding:2px 4px 1px; }
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
        .yfp-drawer-wrap.row5 { bottom: var(--footerH, 66px); background: transparent; } /* docked beside the game: never dim it */
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
        /* Stat Ledger header: one gold line like the game's header -
           "School | City, ST" left, "ROUND n - GAME n" right. */
        .yfp-drawer-head.yfp-drawer-head-line { gap:8px; margin:0 8px; padding:0 4px 0 10px; height:var(--yfp-head-h,23px); border-radius:5px; background:#2e8b5f; border-bottom:0; color:#fff;
          font:700 11px/1 "Roboto Condensed","Arial Narrow",Oswald,sans-serif; letter-spacing:.035em; text-transform:uppercase; }
        .yfp-drawer-head-line .yfp-drawer-who { flex:1; min-width:0; display:flex; align-items:baseline; gap:6px; overflow:hidden; white-space:nowrap; }
        .yfp-drawer-head-line .yfp-drawer-who i { font-style:normal; opacity:.45; }
        .yfp-drawer-head-line .yfp-drawer-school { color:#ffd34f; font:inherit; font-size:12px; letter-spacing:.04em; overflow:hidden; text-overflow:ellipsis; }
        .yfp-drawer-head-line .yfp-drawer-location { color:#fff; font:inherit; overflow:hidden; text-overflow:ellipsis; }
        .yfp-drawer-head-line .yfp-drawer-game { flex:none; margin:0; color:#fff; font:inherit; }
        .yfp-drawer-head-line button { width:24px; height:24px; border:0; color:#fff; font-size:13px; }
        .yfp-drawer .ybr-rules { padding: 14px; }

        @media (max-width: 819px) {
          .yfp-drawer-wrap .bl.bl-embed.yfp-drawer { width: min(410px, 100vw); }
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
