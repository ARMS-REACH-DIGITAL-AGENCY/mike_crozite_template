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

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type GameBox, type Index, type LbGame,
  LAST_WEEK, REGIONS, Face, Styles,
  abbr, fmtRange, loadBoxes, loadIndex, loadLb, previewDate, rankRegion, shortName, standings, tieNote,
} from './gallery';
import { DAY_NAMES, type Star, type WeekCard, calendar, loadStars, runsThrough, schoolSeason, starLine } from './schoolSeason';
import { useBracketNav } from './bracketNav';
import { getSchoolCrestUrl, CREST_FALLBACK_PATH } from '@/lib/schoolAssets';
import BracketRules from './BracketRules';

function Crest({ h }: { h: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="yfp-crest" src={getSchoolCrestUrl(h)} alt="" loading="lazy" onError={(e) => { e.currentTarget.src = CREST_FALLBACK_PATH; }} />;
}

const dates = (index: Index, w: number) => (index.weeks[w - 1] ? fmtRange(index.weeks[w - 1][0], index.weeks[w - 1][1]) : '');

type Open = { card: WeekCard; side: 'h' | 'a' };

// One week: the matchup, the line and the score. Visitor on the left, home
// on the right (and in the line, visitor on top).
function WeekCardView({ index, card, me, star, focused, onOpen }: { index: Index; card: WeekCard; me: number; star?: Star; focused: boolean; onOpen: (o: Open) => void }) {
  const g = card.game;
  const S = index.schools;
  const status = card.state === 'final' ? 'Final' : card.state === 'live' ? (card.days ? `Thru ${DAY_NAMES[card.days - 1]}` : 'Starts Mon') : card.state === 'next' ? 'Upcoming' : card.state === 'bye' ? 'Bye' : 'TBD';
  let result = '';
  if (g && card.state === 'final') result = g[6] === null ? 'T' : g[6] === me ? 'W' : 'L';
  const [hr, ar] = g ? runsThrough(g, card.days) : [0, 0];
  const played = card.state === 'final' || card.state === 'live';
  const canOpen = played;
  const team = (side: 'h' | 'a') => {
    const h = side === 'h' ? g![2] : g![3];
    return (
      <button type="button" className={`yfp-team ${side}${h === me ? ' me' : ''}`} disabled={!canOpen}
        onClick={() => onOpen({ card, side })} aria-label={canOpen ? `${shortName(S[h]?.[0] || '')}: this week's players` : undefined}>
        <Crest h={h} />
        <b>{shortName(S[h]?.[0] || '')}</b>
      </button>
    );
  };
  return (
    <article className={`yfp-card ${card.state}${focused ? ' focus' : ''}`} id={`fweek-${card.week}`}>
      <div className="yfp-eye">
        <span>Week {card.week} · {card.stage}</span>
        <span>{dates(index, card.week)} · {status}{result && <em className={result}>{result}</em>}</span>
      </div>
      {g ? (
        <>
          <div className="yfp-score">
            {team('a')}
            <div className="yfp-runs">{played ? ar : ''}</div>
            <div className="yfp-dash">{played ? '–' : 'vs'}</div>
            <div className="yfp-runs">{played ? hr : ''}</div>
            {team('h')}
          </div>
          <table className="yfp-line">
            <thead><tr><th />{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <th key={n}>{n}</th>)}<th className="r">R</th></tr></thead>
            <tbody>
              {(['a', 'h'] as const).map((side) => {
                const h = side === 'h' ? g[2] : g[3];
                const off = side === 'h' ? 0 : 1;
                return (
                  <tr key={side} className={h === me ? 'me' : ''}>
                    <th><button type="button" disabled={!canOpen} onClick={() => onOpen({ card, side })}>{abbr(shortName(S[h]?.[0] || ''))}</button></th>
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
                      const shown = card.state === 'final' || (card.state === 'live' && i < card.days);
                      const v = g[5][i * 2 + off];
                      return <td key={i} className={shown && v ? 'hit' : ''}>{shown ? v : ''}</td>;
                    })}
                    <td className="r">{played ? (side === 'h' ? hr : ar) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {card.state === 'final' && tieNote(g[4]) && <div className="yfp-note">{tieNote(g[4])}</div>}
          {card.state === 'final' && g[4] === 'tie' && <div className="yfp-note">Tie · half a win each</div>}
          {card.state === 'final' && star && <div className="yfp-star"><b>★ Alumni of the Week</b> {starLine(star)}</div>}
        </>
      ) : (
        <div className="yfp-tbd">
          <span className="yfp-q">?</span>
          <span>{card.state === 'bye' ? 'No game' : 'Opponent TBD'}{card.note ? <small>{card.note}</small> : null}</span>
        </div>
      )}
    </article>
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const S = index.schools;
  const h = side === 'h' ? g[2] : g[3];
  const [hr, ar] = runsThrough(g, 7);
  return createPortal(
    <div className="yfp-drawer-wrap" role="presentation" onClick={onClose}>
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
    </div>,
    document.body,
  );
}

// The rules, in a drawer from the right.
function RulesDrawer({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="yfp-drawer-wrap" role="presentation" onClick={onClose}>
      <aside className="bl bl-embed yfp-drawer right" role="dialog" aria-modal="true" aria-label="Rules" onClick={(e) => e.stopPropagation()}>
        <div className="yfp-drawer-head"><div><b>Rules</b><span>How it&apos;s played and scored</span></div><button type="button" onClick={onClose} aria-label="Close">✕</button></div>
        <BracketRules />
      </aside>
    </div>,
    document.body,
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

  // Week order, under a heading per round (and the postseason).
  const groups = useMemo(() => {
    const out: { key: string; title: string; list: WeekCard[] }[] = [];
    for (const c of cards) {
      const r = c.week <= LAST_WEEK ? Math.ceil(c.week / 3) : 0;
      const key = r ? `r${r}` : 'post';
      if (out[out.length - 1]?.key !== key) out.push({ key, title: r ? `Round ${r} · weeks ${r * 3 - 2}–${r * 3}` : 'Postseason', list: [] });
      out[out.length - 1].list.push(c);
    }
    return out;
  }, [cards]);
  // The week to open on: the current round's first week (the current week
  // after week 30; the last week once the season's over).
  const startWeek = useMemo(() => {
    if (!cal || cal.week < 1 || !cards.length) return 0;
    if (cal.week <= LAST_WEEK) return Math.ceil(cal.week / 3) * 3 - 2;
    return cards.find((c) => c.week === cal.week)?.week ?? cards[cards.length - 1].week;
  }, [cal, cards]);

  // Scroll a week's card to just under rows 1-3 (they stay pinned at the top).
  const scrollToWeek = (week: number, smooth: boolean) => {
    const el = document.getElementById(`fweek-${week}`);
    if (!el) return;
    const pinned = document.querySelector('.yat-row3-shell')?.getBoundingClientRect();
    const top = el.getBoundingClientRect().top + window.scrollY - (pinned ? Math.max(0, pinned.bottom) : 0) - 30;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  };
  // Open on the current round, once (after the awards are in, so nothing
  // moves the cards afterwards).
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !startWeek || (region && !stars)) return;
    opened.current = true;
    requestAnimationFrame(() => scrollToWeek(startWeek, false));
  }, [startWeek, region, stars]);

  // Row 3's timeline: a slide scrolls to its week's card.
  useEffect(() => {
    if (!nav.focusSeq || !nav.focusWeek) return;
    if (!document.getElementById(`fweek-${nav.focusWeek}`)) return;
    scrollToWeek(nav.focusWeek, true);
    const on = window.setTimeout(() => setFocused(nav.focusWeek), 0);
    const off = window.setTimeout(() => setFocused(0), 2200);
    return () => { window.clearTimeout(on); window.clearTimeout(off); };
  }, [nav.focusSeq, nav.focusWeek]);

  const school = index?.schools[me];
  return (
    <div className="yfp">
      <div ref={sentinel} className="yfp-top" />
      {error && <p className="yfp-empty">Could not load the bracket ({error}).</p>}
      {!error && (!index || !lb || !cal) && <p className="yfp-empty">Loading the 2026 season…</p>}
      {index && lb && cal && (
        <div className="yfp-layout">
          <div className="yfp-main">
            <div className="yfp-kick">
              {school ? <>2026 · Region {school[1]} · {REGIONS[school[1]]} · #{school[2]} seed</> : 'Not in the 2026 bracket field'}
              <span>simulation · as of {asof}</span>
            </div>
            {groups.map((grp) => (
              <section key={grp.key} className="yfp-group">
                <h3 className={cal.week <= index.weeks.length && grp.list.some((c) => c.week === startWeek) ? 'now' : ''}>{grp.title}</h3>
                <div className="yfp-feed">
                  {grp.list.map((c) => <WeekCardView key={c.week} index={index} card={c} me={me} star={stars?.[c.week]} focused={focused === c.week} onOpen={setOpen} />)}
                </div>
              </section>
            ))}
            {!school && <p className="yfp-empty">This school isn&apos;t one of the 1,024 in the 2026 bracket.</p>}
          </div>
          <RegionColumn index={index} lb={lb} me={me} final={cal.final} onRules={() => setRules(true)} />
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
        .yfp-layout { display: grid; grid-template-columns: minmax(0, 1fr) 180px; gap: 16px; align-items: start; max-width: 1000px; margin: 0 auto; }
        .yfp-main { min-width: 0; }
        .yfp-kick { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; margin: 0 0 10px; color: var(--yfp-gold); font: 700 9px/1.3 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
        .yfp-kick span { color: var(--yfp-muted); }
        .yfp-group { margin: 0 0 16px; }
        .yfp-group h3.now::after { content: ' · now'; color: var(--yfp-muted); }
        .yfp-group h3 { margin: 0 0 8px; color: var(--yfp-gold); font: 400 14px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
        .yfp-feed { display: flex; flex-direction: column; gap: 8px; }

        /* A week: like a story card - thin border, date eyebrow on top. */
        .yfp-card { border: 1px solid var(--yfp-card-border); border-radius: 8px; background: var(--yfp-card-bg); padding: 7px 8px 8px; transition: border-color .15s ease, box-shadow .15s ease; scroll-margin: 90px; }
        .yfp-card.focus { border-color: var(--yfp-gold); box-shadow: 0 0 0 2px var(--yfp-gold); }
        .yfp-card.tbd, .yfp-card.bye { opacity: .72; }
        .yfp-eye { display: flex; justify-content: space-between; gap: 8px; color: var(--yfp-gold); font: 700 8px/1.2 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
        .yfp-eye span:last-child { color: var(--yfp-muted); white-space: nowrap; display: inline-flex; gap: 5px; align-items: center; }
        .yfp-eye em { font-style: normal; padding: 1px 4px; border-radius: 3px; font-size: 9px; }
        .yfp-eye em.W { color: var(--yfp-win); background: rgba(127,209,139,.15); }
        .yfp-eye em.L { color: var(--yfp-loss); background: rgba(226,120,106,.15); }
        .yfp-eye em.T { color: var(--yfp-muted); background: rgba(128,128,128,.15); }
        .yfp-score { display: grid; grid-template-columns: minmax(0,1fr) auto auto auto minmax(0,1fr); align-items: center; gap: 8px; margin: 6px 0 4px; }
        .yfp-team { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 0; border: 0; background: transparent; color: var(--yfp-muted); font: inherit; cursor: pointer; text-align: left; }
        .yfp-team.h { flex-direction: row-reverse; text-align: right; }
        .yfp-team:disabled { cursor: default; }
        .yfp-team b { min-width: 0; font: 500 13px/1.15 Oswald, sans-serif; letter-spacing: .02em; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .yfp-team.me b { color: var(--yfp-gold); }
        .yfp-team:not(:disabled):hover b { text-decoration: underline; }
        .yfp-crest { width: 34px; height: 34px; object-fit: contain; flex: 0 0 auto; }
        .yfp-runs { font: 400 32px/1 "Bebas Neue", Oswald, sans-serif; color: var(--yfp-strong); min-width: 16px; text-align: center; }
        .yfp-dash { color: var(--yfp-muted); font: 600 10px/1 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
        .yfp-line { width: 100%; border-collapse: collapse; table-layout: fixed; font: 500 11px/1 Oswald, sans-serif; color: var(--yfp-muted); }
        .yfp-line th, .yfp-line td { padding: 3px 0; text-align: center; border-top: 1px solid var(--yfp-card-border); }
        .yfp-line thead th { border-top: 0; color: var(--yfp-faint); font-size: 9px; font-weight: 500; }
        .yfp-line th:first-child { width: 44px; text-align: left; }
        .yfp-line tbody th button { padding: 0; border: 0; background: transparent; color: inherit; font: 600 11px/1 Oswald, sans-serif; letter-spacing: .04em; cursor: pointer; }
        .yfp-line tbody th button:disabled { cursor: default; }
        .yfp-line tbody th button:not(:disabled):hover { color: var(--yfp-gold); text-decoration: underline; }
        .yfp-line tr.me th button, .yfp-line tr.me td.r { color: var(--yfp-gold); }
        .yfp-line td.hit { color: var(--yfp-strong); font-weight: 700; }
        .yfp-line .r { width: 26px; border-left: 1px solid var(--yfp-card-border); color: var(--yfp-strong); font-weight: 700; }
        .yfp-star { margin-top: 5px; color: var(--yfp-text); font: 400 11px/1.35 system-ui, sans-serif; }
        .yfp-star b { color: var(--yfp-gold); font: 600 10px/1 Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; margin-right: 4px; }
        .yfp-note { margin-top: 5px; color: var(--yfp-gold); font: 400 11px/1.35 system-ui, sans-serif; }
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

        /* The drawers: home from the right, visitor from the left. */
        .yfp-drawer-wrap { position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,.45); }
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
          .yfp-crest { width: 26px; height: 26px; }
          .yfp-runs { font-size: 26px; }
          .yfp-team b { font-size: 11.5px; }
          .yfp-score { gap: 5px; }
          .yfp-line { font-size: 10px; }
          .yfp-line th:first-child { width: 34px; }
          .yfp-line tbody th button { font-size: 10px; }
          .yfp-line .r { width: 20px; }
        }
      `}</style>
    </div>
  );
}
