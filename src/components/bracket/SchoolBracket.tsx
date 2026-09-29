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
  type GameBox, type Index, type LbGame,
  LAST_WEEK, LBT_ROUNDS, REGIONS, WORLD_SERIES, Face, Styles,
  fmtDate, fmtRange, loadBoxes, loadIndex, loadLb, previewDate, rankRegion, shortName, standings,
} from './gallery';
import { DAY_NAMES, type Star, type WeekCard, calendar, loadStars, masterGames, records, runsThrough, schoolSeason, starLine } from './schoolSeason';
import { slideToWeek, useBracketNav } from './bracketNav';
import { getSchoolCrestUrl, CREST_FALLBACK_PATH } from '@/lib/schoolAssets';
import BracketRules from './BracketRules';
import { Roboto_Condensed } from 'next/font/google';

// The scoreboard type (the game cards), condensed like the MLB and ESPN apps.
const scoreboardFont = Roboto_Condensed({ subsets: ['latin'], variable: '--yfp-sb', display: 'swap' });

function Crest({ h }: { h: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="yfp-crest" src={getSchoolCrestUrl(h)} alt="" loading="lazy" onError={(e) => { e.currentTarget.src = CREST_FALLBACK_PATH; }} />;
}

const dates = (index: Index, w: number) => (index.weeks[w - 1] ? fmtRange(index.weeks[w - 1][0], index.weeks[w - 1][1]) : '');

type Open = { card: WeekCard; side: 'h' | 'a' };

// One week, like a scoreboard app's box: a status pill and the week, then
// the two schools (visitor over home) as the line score itself - crest,
// name, record, innings 1-9, runs, a marker on the winner - then the Alumni
// of the Week. The round is the tab, so it isn't repeated here.
export const shortStage = (stage: string) => stage.replace(/^Round \d+ · /, '').replace(/ leaderboard game$/, ' game');
function WeekCardView({ index, card, me, star, rec, focused, onOpen }: {
  index: Index; card: WeekCard; me: number; star?: Star; rec: (h: number, week: number) => string; focused: boolean; onOpen: (o: Open) => void;
}) {
  const g = card.game;
  const S = index.schools;
  const pill = card.state === 'final' ? 'Final' : card.state === 'live' ? (card.days ? `Thru ${DAY_NAMES[card.days - 1]}` : 'Mon') : card.state === 'next' ? fmtDate(index.weeks[card.week - 1][0]) : card.state === 'bye' ? 'Bye' : 'TBD';
  const [hr, ar] = g ? runsThrough(g, card.days) : [0, 0];
  const played = card.state === 'final' || card.state === 'live';
  const head = (
    <div className="yfp-head">
      <span className={`yfp-pill ${card.state}`}>{pill}</span>
      <span className="yfp-eye">Week {card.week} · {shortStage(card.stage)}</span>
      <i className="yfp-dates">{dates(index, card.week)}</i>
    </div>
  );
  if (!g) {
    return (
      <article className={`yfp-card ${card.state}${focused ? ' focus' : ''}`} id={`fweek-${card.week}`}>
        {head}
        <div className="yfp-tbd"><span className="yfp-q">?</span><span>{card.state === 'bye' ? 'No game this week' : 'Opponent TBD'}{card.note ? <small>{card.note}</small> : null}</span></div>
      </article>
    );
  }
  return (
    <article className={`yfp-card ${card.state}${focused ? ' focus' : ''}`} id={`fweek-${card.week}`}>
      {head}
      <table className="yfp-box">
        <thead><tr><th className="tm" />{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <th key={n}>{n}</th>)}<th className="r">R</th></tr></thead>
        <tbody>
          {(['a', 'h'] as const).map((side) => {
            const h = side === 'h' ? g[2] : g[3];
            const off = side === 'h' ? 0 : 1;
            const won = card.state === 'final' && g[6] === h;
            const lost = card.state === 'final' && g[6] !== null && g[6] !== h;
            return (
              <tr key={side} className={`${h === me ? 'me' : ''}${lost ? ' lost' : ''}`}>
                <th className="tm">
                  <button type="button" disabled={!played} onClick={() => onOpen({ card, side })} aria-label={played ? `${shortName(S[h]?.[0] || '')}: this week's players` : undefined}>
                    <Crest h={h} />
                    <b>{shortName(S[h]?.[0] || '')}</b>
                    <small>{rec(h, card.state === 'final' ? card.week : card.week - 1)}</small>
                  </button>
                </th>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
                  const shown = card.state === 'final' || (card.state === 'live' && i < card.days);
                  const v = g[5][i * 2 + off];
                  return <td key={i} className={shown && v ? 'hit' : ''}>{shown ? v : ''}</td>;
                })}
                <td className="r">{played ? (side === 'h' ? hr : ar) : ''}{won && <span className="yfp-won" aria-label="winner">◀</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {card.state === 'final' && star && (
        <div className="yfp-star">★ <a href={`/${me}/player/${encodeURIComponent(star[5])}`}>{starLine(star)}</a></div>
      )}
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
  const [box, setBox] = useState<Record<string, GameBox> | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (card.file) loadBoxes(card.file).then((b) => { if (!cancelled) setBox(b); }).catch(() => { if (!cancelled) setBox({}); });
    return () => { cancelled = true; };
  }, [card.file]);
  const S = index.schools;
  const h = side === 'h' ? g[2] : g[3];
  const [hr, ar] = runsThrough(g, 7);
  return (
    <DrawerWrap onClose={onClose}>
      <aside className={`bl bl-embed yfp-drawer ${side === 'h' ? 'right' : 'left'}`} role="dialog" aria-modal="true"
        aria-label={`${shortName(S[h]?.[0] || '')}, week ${card.week}`} onClick={(e) => e.stopPropagation()}>
        <div className="yfp-drawer-head">
          <Crest h={h} />
          <div><b>{shortName(S[h]?.[0] || '')}</b><span>Week {card.week} · {card.stage} · {side === 'h' ? 'Home' : 'Visitor'}</span></div>
          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {card.state === 'live' ? (
          <p className="yfp-drawer-wait">The players&apos; lines post when the week is final.</p>
        ) : (
          <Face side={side} label={card.stage} week={card.week} dates={dates(index, card.week)} home={g[2]} away={g[3]}
            names={[shortName(S[g[2]]?.[0] || ''), shortName(S[g[3]]?.[0] || '')]} score={[hr, ar]} innings={g[5]} winner={g[6]}
            decidedBy={g[4]} box={box ? box[String(g[0])] : undefined} loading={!box} />
        )}
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
  const through = Math.min(final, LAST_WEEK);
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
      <div className="yfp-lb-sort" role="group" aria-label="Order">
        <button type="button" className={order === 'region' ? 'on' : ''} aria-pressed={order === 'region'} onClick={() => setOrder('region')}>Region</button>
        <button type="button" className={order === 'az' ? 'on' : ''} aria-pressed={order === 'az'} onClick={() => setOrder('az')}>A–Z</button>
      </div>
      {order === 'region' ? boards.map((b) => (
        <section key={b.region} className="yfp-lb-group">
          <div className="yfp-lb-head"><span>{b.region}</span> {REGIONS[b.region]}</div>
          <ol>{b.ranked.map((s, i) => line(s, String(i + 1), `${index.schools[s.h]?.[0]} · #${i + 1} in Region ${b.region} · ${s.rf} runs (${diff(s)})`))}</ol>
        </section>
      )) : (
        <ol>{az.map((x) => line(x.s, `R${x.region}`, `${index.schools[x.s.h]?.[0]} · #${x.rank} in Region ${x.region} · ${x.s.rf} runs (${diff(x.s)})`))}</ol>
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
  const cal = useMemo(() => (index && asof ? calendar(index, asof) : null), [index, asof]);
  const rec = useMemo(() => (index && lb ? records(index, lb) : () => ''), [index, lb]);

  // The FunZone: a tab per round (its three weeks stacked, one screen, no
  // scrolling), the postseason when the school is in it, and every game in
  // the tournament by master game #.
  const tabs = useMemo(() => {
    const t: { key: string; label: string; sub: string; list: WeekCard[] }[] = [];
    for (let r = 1; r <= 10; r++) t.push({ key: `r${r}`, label: `R${r}`, sub: '', list: cards.filter((c) => c.week <= LAST_WEEK && Math.ceil(c.week / 3) === r) });
    const post = cards.filter((c) => c.week > LAST_WEEK);
    if (post.length) t.push({ key: 'post', label: 'Post', sub: '', list: post });
    for (const x of t) {
      const done = x.list.filter((c) => c.state === 'final' && c.game);
      const w = done.filter((c) => c.game![6] === me).length;
      const l = done.filter((c) => c.game![6] !== null && c.game![6] !== me).length;
      x.sub = done.length ? `${w}-${l}` : '';
    }
    t.push({ key: 'all', label: 'All', sub: 'Game #', list: [] });
    return t;
  }, [cards, me]);
  const tabOfWeek = (w: number) => (w > LAST_WEEK ? 'post' : `r${Math.max(1, Math.ceil(w / 3))}`);
  const nowTab = useMemo(() => {
    if (!cal || cal.week < 1) return 'r1';
    if (cal.week <= LAST_WEEK) return tabOfWeek(cal.week);
    return cards.some((c) => c.week > LAST_WEEK) ? 'post' : 'r10';
  }, [cal, cards]);
  const [picked, setPicked] = useState('');
  const tab = picked || nowTab;
  // A round button also slides row 3's timeline to that round: its current
  // week, or its latest finished week, or its first.
  const pickTab = (key: string) => {
    setPicked(key);
    const list = tabs.find((t) => t.key === key)?.list || [];
    const target = list.find((c) => c.week === cal?.week) || [...list].reverse().find((c) => c.state === 'final') || list[0];
    if (target) slideToWeek(target.week);
  };

  // Row 3's timeline: a slide opens its week's round and marks the card.
  useEffect(() => {
    if (!nav.focusSeq || !nav.focusWeek) return;
    const on = window.setTimeout(() => { setPicked(tabOfWeek(nav.focusWeek)); setFocused(nav.focusWeek); }, 0);
    const off = window.setTimeout(() => setFocused(0), 2200);
    return () => { window.clearTimeout(on); window.clearTimeout(off); };
  }, [nav.focusSeq, nav.focusWeek]);

  const school = index?.schools[me];
  const cur = tabs.find((t) => t.key === tab);
  const roundTitle = (key: string) => {
    if (key === 'post') return 'Postseason';
    const r = Number(key.slice(1));
    const a = index?.weeks[r * 3 - 3], b = index?.weeks[r * 3 - 1];
    return `Round ${r} · weeks ${r * 3 - 2}–${r * 3}${a && b ? ` · ${fmtRange(a[0], b[1])}` : ''}`;
  };
  return (
    <div className={`yfp ${scoreboardFont.variable}`}>
      <div ref={sentinel} className="yfp-top" />
      {error && <p className="yfp-empty">Could not load the bracket ({error}).</p>}
      {!error && (!index || !lb || !cal) && <p className="yfp-empty">Loading the 2026 season…</p>}
      {index && lb && cal && (
        <div className="yfz">
          <div className={`yfz-panel${tab === 'all' ? ' all' : ''}`}>
            {tab === 'all' ? (
              <AllGames index={index} me={me} cal={cal} onOpen={setOpen} />
            ) : (
              <div className="yfz-round">
                <div className="yfz-cards">
                  {cur?.list.map((c) => <WeekCardView key={c.week} index={index} card={c} me={me} star={stars?.[c.week]} rec={rec} focused={focused === c.week} onOpen={setOpen} />)}
                  {!school && <p className="yfp-empty">This school isn&apos;t one of the 1,024 in the 2026 bracket.</p>}
                </div>
              </div>
            )}
            {tab !== 'all' && <RegionColumn index={index} lb={lb} me={me} final={cal.final} onRules={() => setRules(true)} />}
          </div>
          {/* The FunZone's icon row, pinned above the footer ad. */}
          <nav className="yfz-dock" aria-label="Rounds">
            <div className="yfz-dock-tabs" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
              {tabs.map((t) => (
                <button key={t.key} type="button" className={`yfz-tab${t.key === tab ? ' on' : ''}${t.key === nowTab && cal.week >= 1 && cal.week <= index.weeks.length ? ' now' : ''}`}
                  aria-pressed={t.key === tab} onClick={() => pickTab(t.key)} title={t.key === 'all' ? 'Every game by master game #' : roundTitle(t.key)}>
                  <b>{t.label}</b>
                  <span>{t.sub || (t.key === nowTab && cal.week >= 1 && cal.week <= index.weeks.length ? 'Now' : '\u00a0')}</span>
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
        .yfp-crest { width: 22px; height: 22px; object-fit: contain; flex: 0 0 auto; }
        .yfp-star { margin-top: 3px; color: var(--yfp-gold); font: 500 11px/1.25 var(--yfp-sb), "Arial Narrow", Oswald, sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .yfp-star a { color: var(--yfp-text); text-decoration: none; }
        .yfp-star a:hover { color: var(--yfp-gold); text-decoration: underline; }
        .yfp-note { margin-top: 4px; color: var(--yfp-muted); font: 400 11px/1.35 system-ui, sans-serif; }
        .yfp-tbd { display: flex; align-items: center; gap: 10px; margin-top: 6px; color: var(--yfp-muted); font: 500 13px/1.2 Oswald, sans-serif; letter-spacing: .03em; }
        .yfp-tbd small { display: block; margin-top: 2px; font: 400 11px/1.3 system-ui, sans-serif; letter-spacing: 0; }
        .yfp-q { width: 34px; height: 34px; flex: 0 0 auto; display: grid; place-items: center; border: 1px dashed var(--yfp-card-border); border-radius: 50%; font: 400 20px/1 "Bebas Neue", Oswald, sans-serif; }

        /* The leaderboard column (a profile's teammates). */
        /* Pinned just under rows 1-3 while the weeks scroll. */
        .yfp-lb { min-width: 0; position: sticky; top: calc(var(--row1-h, 36px) + var(--row2-h, 54px) + var(--row3-h, 100px) + 8px); max-height: calc(100dvh - var(--row1-h, 36px) - var(--row2-h, 54px) - var(--row3-h, 100px) - var(--footerH, 66px) - 16px); overflow-y: auto; font: 400 10px/1.35 system-ui, sans-serif; }
        .yfp-lb-title { color: var(--yfp-gold); font: 400 13px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .07em; text-transform: uppercase; }
        .yfp-lb-sub { margin: 3px 0 6px; color: var(--yfp-muted); font-size: 9px; }
        .yfp-lb-sort { position: sticky; top: 0; z-index: 1; display: flex; gap: 2px; margin: 0 0 8px; padding: 2px 0; background: var(--bg, #070707); }
        body.light-theme .yfp-lb-sort { background: var(--bg, #f4efe6); }
        .yfp-lb-sort button { flex: 1; min-height: 22px; padding: 0 4px; border: 1px solid var(--yfp-card-border); border-radius: 4px; background: var(--yfp-card-bg); color: var(--yfp-muted); font: 600 9px/1 Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
        .yfp-lb-sort button.on { border-color: var(--yfp-gold); color: var(--yfp-gold); }
        .yfp-lb-group { margin: 0 0 9px; }
        .yfp-lb-head { color: var(--yfp-strong); font: 600 9px/1.25 Oswald, sans-serif; letter-spacing: .04em; text-transform: uppercase; }
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
        .yfz { --yfz-dock-h: 58px; position: relative; height: calc(100dvh - var(--row1-h, 36px) - var(--row2-h, 54px) - var(--row3-h, 100px) - var(--row4-h, 56px) - var(--footerH, 66px)); min-height: 300px; overflow: hidden; }
        .yfz-panel { position: absolute; inset: 0 0 var(--yfz-dock-h) 0; display: grid; grid-template-columns: minmax(0, 1fr) 180px; gap: 12px; padding: 8px 10px; }
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
          .yfz { --yfz-dock-h: 56px; }
          .yfz-panel { grid-template-columns: minmax(0, 1fr) 104px; gap: 8px; padding: 6px 8px; }
          .yfz-all table { font-size: 11px; }
          .yfz-all td { padding: 4px 3px; }
          .yfz-all th:nth-child(3), .yfz-all td:nth-child(3) { display: none; }
        }

        /* Phones: no scoreboard ticker (row 4) - the room goes to the games. */
        @media (max-width: 760px) {
          body:has(.yfz) { --row4-h: 0px; }
          body:has(.yfz) .yat-row4-shell { display: none; }
        }

        /* The drawers: home from the right, visitor from the left. */
        /* Above the site's floating buttons, so nothing covers the close button. */
        .yfp-drawer-wrap { position: fixed; inset: 0; z-index: 2147483200; background: rgba(0,0,0,.45); }
        .yfp-drawer-wrap.row5 { bottom: var(--footerH, 66px); background: rgba(0,0,0,.3); }
        .bl.bl-embed.yfp-drawer { position: absolute; top: 0; bottom: 0; width: min(560px, 94vw); overflow-y: auto; overscroll-behavior: contain; padding: 0 0 24px; box-shadow: 0 0 30px rgba(0,0,0,.45); animation: yfp-in-r .22s ease-out; }
        .bl.bl-embed.yfp-drawer.right { right: 0; }
        .bl.bl-embed.yfp-drawer.left { left: 0; animation-name: yfp-in-l; }
        @keyframes yfp-in-r { from { transform: translateX(100%); } to { transform: none; } }
        @keyframes yfp-in-l { from { transform: translateX(-100%); } to { transform: none; } }
        @media (prefers-reduced-motion: reduce) { .bl.bl-embed.yfp-drawer { animation: none; } }
        .yfp-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: var(--panel2); border-bottom: 1px solid var(--line); }
        .yfp-drawer-head div { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .yfp-drawer-head b { font: 500 18px/1.1 Oswald, sans-serif; letter-spacing: .03em; color: var(--gold); }
        .yfp-drawer-head span { color: var(--muted); font: 500 11px/1.2 Oswald, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
        .yfp-drawer-head button { width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 50%; background: transparent; color: var(--text); font-size: 15px; cursor: pointer; }
        .yfp-drawer .ybr-rules { padding: 14px; }
        .yfp-drawer-wait { padding: 20px 14px; color: var(--muted); }

        @media (max-width: 899px) {
          .yfp { padding: 8px 8px 16px; }
          .yfp-layout { grid-template-columns: minmax(0, 1fr) 104px; gap: 8px; }
          .yfp-lb { font-size: 9px; }
          .yfp-lb li { grid-template-columns: 16px minmax(0,1fr) auto; gap: 3px; }
          .yfp-card { padding: 6px 8px 5px; }
          .yfp-box thead th:not(.tm):not(.r) { width: 13px; }
          .yfp-box { font-size: 12px; }
          .yfp-box .tm b { font-size: 13.5px; }
          .yfp-box .tm small { display: none; }
          .yfp-box .r { width: 28px; padding-right: 10px; font-size: 17px; }
          .yfp-crest { width: 20px; height: 20px; }
          .yfp-box .tm button { gap: 4px; }
        }
      `}</style>
    </div>
  );
}
