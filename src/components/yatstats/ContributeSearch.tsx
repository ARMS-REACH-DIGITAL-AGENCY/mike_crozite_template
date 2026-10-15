'use client';

// The site's Global Search inside the Connect & Contribute drawer: the same
// search box, the same Player Name / High School / Current Team buttons and
// the same result cards (built by SearchDrawerTabs, so it is the same search
// as the left drawer's, favorites included). Picking a result selects it
// here instead of opening his page; picking a high school lists its players.
// mode="school" is the school picker (the crest, school info, a missing alum).

import { useEffect, useRef, useState } from 'react';
import type { ContributePlayer, ContributeSchool } from '@/lib/contribute';
import {
  fetchJson,
  handleFavoriteButtonClick,
  hydrateFavoriteButtons,
  renderPlayerRows,
  renderSchoolRows,
  renderTeamRows,
} from './SearchDrawerTabs';

type Mode = 'name' | 'school' | 'team';

type Props =
  | { mode?: 'player'; onPlayer: (p: ContributePlayer) => void; onSchool?: never }
  | { mode: 'school'; onSchool: (s: ContributeSchool) => void; onPlayer?: never };

export default function ContributeSearch(props: Props) {
  const schoolOnly = props.mode === 'school';
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<Mode>(schoolOnly ? 'school' : 'name');
  const [rosterOf, setRosterOf] = useState<{ hsid: string; name: string } | null>(null);
  const results = useRef<HTMLDivElement | null>(null);
  const pick = useRef(props);
  useEffect(() => { pick.current = props; });

  // Search as they type (like the left drawer), or a school's players.
  useEffect(() => {
    const el = results.current;
    if (!el) return;
    let live = true;
    const term = q.trim();
    const timer = window.setTimeout(async () => {
      try {
        if (rosterOf) {
          el.innerHTML = '<div class="yat-search-empty">Loading…</div>';
          const roster = await fetchJson(`/api/players/${encodeURIComponent(rosterOf.hsid)}`);
          if (!live) return;
          const players = (Array.isArray(roster) ? roster : []).map((p: Record<string, unknown>) => ({
            playerId: p.playerid, displayName: p.display_name, firstname: p.firstname, lastname: p.lastname,
            schoolId: rosterOf.hsid, schoolName: rosterOf.name, currentTeamName: p.current_team_name,
          }));
          el.innerHTML = renderPlayerRows(players, 'No players found for this school.');
          hydrateFavoriteButtons(el);
          return;
        }
        if (!term) {
          el.innerHTML = '<div class="yat-search-empty">Start typing to search.</div>';
          return;
        }
        el.innerHTML = '<div class="yat-search-empty">Searching...</div>';
        if (mode === 'name') {
          const data = await fetchJson(`/api/players/search?q=${encodeURIComponent(term)}&limit=60`);
          if (!live) return;
          el.innerHTML = renderPlayerRows(Array.isArray(data.players) ? data.players : [], 'No player matches.');
          hydrateFavoriteButtons(el);
        } else if (mode === 'school') {
          const data = await fetchJson(`/api/schools/search?q=${encodeURIComponent(term)}&limit=30`);
          if (!live) return;
          el.innerHTML = renderSchoolRows(Array.isArray(data.programs) ? data.programs : [], 'No school matches.');
        } else {
          const data = await fetchJson(`/api/teams/search?q=${encodeURIComponent(term)}&limit=75`);
          if (!live) return;
          el.innerHTML = renderTeamRows(Array.isArray(data.teams) ? data.teams : [], 'No current team matches.');
          hydrateFavoriteButtons(el);
        }
      } catch {
        if (live) el.innerHTML = '<div class="yat-search-empty">Search failed. Try again.</div>';
      }
    }, rosterOf ? 0 : 180);
    return () => { live = false; window.clearTimeout(timer); };
  }, [q, mode, rosterOf]);

  // A result picks the player (or school) here instead of opening his page.
  useEffect(() => {
    const el = results.current;
    if (!el) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const fav = target.closest('.yat-search-fav-btn') as HTMLElement | null;
      if (fav) {
        event.preventDefault();
        event.stopPropagation();
        if (!fav.hasAttribute('aria-disabled')) handleFavoriteButtonClick(fav);
        return;
      }
      const card = target.closest<HTMLElement>('[data-player-id], [data-school-id].yat-search-school-card');
      if (!card) return;
      event.preventDefault();
      event.stopPropagation();
      const d = card.dataset;
      if (card.classList.contains('yat-search-school-card')) {
        const school = { hsid: d.schoolId || '', name: d.schoolName || '', location: d.schoolLocation || '' };
        if (pick.current.mode === 'school') pick.current.onSchool(school);
        else setRosterOf({ hsid: school.hsid, name: school.name });
        return;
      }
      if (pick.current.mode !== 'school' && d.playerId) {
        pick.current.onPlayer({
          playerId: d.playerId,
          displayName: d.playerName || '',
          schoolId: d.schoolId || undefined,
          schoolName: d.schoolName || undefined,
        });
      }
    };
    el.addEventListener('click', onClick, true);
    return () => el.removeEventListener('click', onClick, true);
  }, []);

  return (
    <div className="ycs">
      <div className="yat-gs-input-wrap">
        <input
          type="search"
          className="yat-gs-input"
          value={q}
          onChange={(e) => { setQ(e.target.value); setRosterOf(null); }}
          placeholder={schoolOnly ? 'Search high schools...' : 'Search by name, school, or team...'}
          autoComplete="off"
          aria-label={schoolOnly ? 'Search high schools' : 'Search players'}
        />
        <i className="ri-search-line yat-gs-input-icon" aria-hidden="true" />
      </div>
      {!schoolOnly && (
        <div className="yat-search-mode-buttons" role="tablist" aria-label="Search mode">
          {([['name', 'Player Name'], ['school', 'High School'], ['team', 'Current Team']] as [Mode, string][]).map(([m, label]) => (
            <button type="button" key={m} className={`yat-search-mode-btn${mode === m ? ' active' : ''}`} onClick={() => { setMode(m); setRosterOf(null); }}>{label}</button>
          ))}
        </div>
      )}
      {rosterOf ? (
        <button type="button" className="ycs-back" onClick={() => setRosterOf(null)}>‹ All schools · {rosterOf.name}</button>
      ) : null}
      <div ref={results} className="yat-gs-results ycs-results" role="listbox" aria-label="Search results" />
      <style jsx global>{`
        .ycs .yat-gs-input-wrap { margin-top: 2px; position:relative; display:flex; align-items:center; min-width:0; }
        /* Search icon lives to the left of the prompt, with its own space.
           Global drawer input styles otherwise overwrite search padding. */
        .yat-contribute-drawer .ycs .yat-gs-input-wrap input.yat-gs-input {
          box-sizing:border-box; width:100%; min-width:0;
          padding:10px 34px 10px 43px !important;
          text-indent:0 !important;
        }
        .yat-contribute-drawer .ycs .yat-gs-input-wrap .yat-gs-input-icon {
          position:absolute !important; left:13px !important; right:auto !important;
          top:50% !important; transform:translateY(-50%) !important;
          z-index:1; font-size:18px; pointer-events:none; opacity:.8;
        }
        .ycs-results { max-height: none !important; overflow: visible !important; }
        .ycs-back { align-self: flex-start; margin: 4px 0; border: 0; background: none; padding: 0; color: var(--sb-text); font: 600 12px/1 var(--yat-font-compact); letter-spacing: .05em; text-transform: uppercase; cursor: pointer; }
        .ycs .yat-search-player-result, .ycs .yat-search-school-card { cursor: pointer; }
      `}</style>
    </div>
  );
}
