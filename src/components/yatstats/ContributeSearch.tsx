'use client';

// The site's Global Search inside the Connect & Contribute drawer: the same
// search box, the same Player Name / High School / Current Team buttons and
// the same result cards (built by SearchDrawerTabs, so it is the same search
// as the left drawer's, favorites included). Picking a result selects it
// here instead of opening his page; picking a high school lists its players.
// mode="school" is the school picker (the crest, school info, a missing alum).

import { useEffect, useRef, useState } from 'react';
import type { ContributePlayer, ContributeSchool, ContributeTeam } from '@/lib/contribute';
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
  | { mode?: 'player'; onPlayer: (p: ContributePlayer) => void; onSchool?: never; onTeam?: never }
  | { mode: 'school'; onSchool: (s: ContributeSchool) => void; onPlayer?: never; onTeam?: never }
  | { mode: 'team'; onTeam: (t: ContributeTeam) => void; onPlayer?: never; onSchool?: never };

export default function ContributeSearch(props: Props) {
  const schoolOnly = props.mode === 'school';
  const teamOnly = props.mode === 'team';
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<Mode>(schoolOnly ? 'school' : teamOnly ? 'team' : 'name');
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
          const endpoint = teamOnly ? '/api/teams/entities/search' : '/api/teams/search';
          const data = await fetchJson(`${endpoint}?q=${encodeURIComponent(term)}&limit=75`);
          if (!live) return;
          if (teamOnly) {
            const teams = Array.isArray(data.teams) ? data.teams : [];
            el.innerHTML = teams.length ? `<div class="yat-search-card-list">${teams.map((t: Record<string, unknown>) => {
              const teamId = String(t.teamId || t.teamid || '').trim();
              const name = String(t.name || t.currentTeamName || t.current_team_name || '').trim();
              const level = String(t.level || t.levelLabel || t.level_label || '').trim();
              const org = String(t.orgName || t.currentOrgOrConferenceName || t.current_org_or_conference_name || '').trim();
              const logo = String(t.logoUrl || '').trim() || `https://yatstats-assets.s3.us-west-2.amazonaws.com/teams/${encodeURIComponent(teamId)}.png`;
              return `<button type="button" class="yat-search-card yat-search-team-entity-card" data-team-id="${teamId}" data-team-name="${name.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')}" data-team-level="${level.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')}" data-team-org="${org.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')}" style="width:100%;text-align:left">
                <img src="${logo}" alt="" class="yat-search-thumb yat-search-team-thumb" onerror="this.src='/img/yatstats-logo-circle.png';this.onerror=null" />
                <span class="yat-search-player-text-link"><strong>${name}</strong>${level ? `<small>${level}</small>` : ''}${org ? `<small>${org}</small>` : ''}</span>
              </button>`;
            }).join('')}</div>` : '<div class="yat-search-empty">No college or pro team matches.</div>';
          } else {
            el.innerHTML = renderTeamRows(Array.isArray(data.teams) ? data.teams : [], 'No current team matches.');
            hydrateFavoriteButtons(el);
          }
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
      const card = target.closest<HTMLElement>('[data-player-id], [data-school-id].yat-search-school-card, [data-team-id].yat-search-team-entity-card');
      if (!card) return;
      event.preventDefault();
      event.stopPropagation();
      const d = card.dataset;
      if (card.classList.contains('yat-search-team-entity-card')) {
        if (pick.current.mode === 'team') {
          pick.current.onTeam({
            teamId: d.teamId || '',
            name: d.teamName || '',
            level: d.teamLevel || '',
            orgName: d.teamOrg || '',
            logoUrl: d.teamId ? `https://yatstats-assets.s3.us-west-2.amazonaws.com/teams/${encodeURIComponent(d.teamId)}.png` : '',
          });
        }
        return;
      }
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
          placeholder={schoolOnly ? 'Search high schools...' : teamOnly ? 'Search college or pro teams...' : 'Search by name, school, or team...'}
          autoComplete="off"
          aria-label={schoolOnly ? 'Search high schools' : teamOnly ? 'Search college or pro teams' : 'Search players'}
        />
        <i className="ri-search-line yat-gs-input-icon" aria-hidden="true" />
      </div>
      {!schoolOnly && !teamOnly && (
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
        .ycs .yat-search-player-result, .ycs .yat-search-school-card, .ycs .yat-search-team-entity-card { cursor: pointer; }
        .ycs .yat-search-team-entity-card { display:grid;grid-template-columns:42px minmax(0,1fr);align-items:center;gap:10px;border:1px solid var(--line);background:transparent;color:inherit;padding:8px 10px;border-radius:8px; }
        .ycs .yat-search-team-entity-card .yat-search-player-text-link { display:flex;flex-direction:column;gap:2px;text-decoration:none;color:inherit; }
      `}</style>
    </div>
  );
}
