// src/app/page.tsx
export const runtime = 'nodejs';

import { headers } from 'next/headers';
import React from 'react';
import {
  getSchoolByHsid,
  getRosterByHsid,
  getStatsForPlayers,
} from '../lib/db';

function safeText(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function safeNum(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

type AnyRow = Record<string, any>;

export default async function Home() {
  const headerList = headers();
  const host = headerList.get('host') || 'yatstats.com';
  const hsid = host.split('.')[0] || 'yatstats';

  // Root domain (no HSID subdomain)
  if (hsid === 'yatstats') {
    return (
      <main
        style={{
          padding: 40,
          textAlign: 'center',
          background: '#0c0c0c',
          color: '#f2f2f2',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
        }}
      >
        <h1 style={{ marginBottom: 12 }}>Welcome to YATSTATS</h1>
        <p style={{ margin: 0 }}>
          Visit a school microsite by adding the HSID as subdomain, e.g.,{' '}
          <strong>5004.yatstats.com</strong>
        </p>
      </main>
    );
  }

  try {
    // 1) School lookup by HSID
    const school: AnyRow | null = await getSchoolByHsid(hsid);
    if (!school) {
      return (
        <main style={{ padding: 40, background: '#0c0c0c', color: '#f2f2f2' }}>
          <h1>No school found for HSID {hsid}</h1>
        </main>
      );
    }

    const hs_lookup_key = safeText(school.hs_lookup_key);
    if (!hs_lookup_key) {
      return (
        <main style={{ padding: 40, background: '#0c0c0c', color: '#f2f2f2' }}>
          <h1>School is missing hs_lookup_key for HSID {hsid}</h1>
        </main>
      );
    }

    // 2) Roster for the HSID
    const rosterRows: AnyRow[] = await getRosterByHsid(hsid);

    // Collect player ids and fetch stats
    const playerIds = rosterRows.map((r) => String(r.playerid)).filter(Boolean);
    const statsMap = await getStatsForPlayers(playerIds);

    // Simple render
    return (
      <main style={{ padding: 24, background: '#0c0c0c', color: '#f2f2f2' }}>
        <header style={{ marginBottom: 18 }}>
          <h1 style={{ margin: 0 }}>{safeText(school.school_name || school.school || school.name || hs_lookup_key)}</h1>
          <p style={{ margin: '6px 0 0', color: '#bfbfbf' }}>
            {safeText(school.city)} {safeText(school.state)}
          </p>
        </header>

        <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {rosterRows.length === 0 && (
            <div style={{ padding: 24, background: '#111', borderRadius: 8 }}>
              No roster found for this school.
            </div>
          )}

          {rosterRows.map((player) => {
            const playerid = String(player.playerid ?? '');
            const first = safeText(player.firstname);
            const last = safeText(player.lastname);
            // Prefer common photo fields if present, otherwise fallback to placeholder
            const photo = safeText(player.photo || player.photo_url || player.image_url) || '/images/placeholder-player.png';
            const position = safeText(player.position || player.pos);
            const number = safeText(player.number);
            const team = safeText(player.team);
            const highlevel = safeText(player.highlevel);

            const playerStats = statsMap[playerid] ?? { batting: [], pitching: [] };

            return (
              <article
                key={playerid || `${first}-${last}`}
                style={{
                  background: '#121212',
                  borderRadius: 12,
                  overflow: 'hidden',
                  color: '#fff',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.6)',
                }}
              >
                <div className="inner">
                  <div className="front">
                    {/* === INSERTED IMAGE BLOCK === */}
                    <img
                      src={photo ?? '/images/placeholder-player.png'}
                      alt={`${first ?? ''} ${last ?? ''}`.trim() || 'Player'}
                      style={{
                        width: '100%',
                        height: 200,
                        objectFit: 'cover',
                        borderTopLeftRadius: 12,
                        borderTopRightRadius: 12,
                      }}
                    />
                    {/* === end image block === */}
                  </div>

                  <div style={{ padding: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 18 }}>{`${first} ${last}`.trim() || 'Player'}</h3>
                    <div style={{ marginTop: 6, color: '#cfcfcf', fontSize: 13 }}>
                      <div>{position ? `${position}` : null} {number ? `#${number}` : null}</div>
                      <div style={{ marginTop: 4 }}>{team ? team : null} {highlevel ? ` • ${highlevel}` : null}</div>
                    </div>

                    {/* Example: show most recent batting season if available */}
                    {Array.isArray(playerStats.batting) && playerStats.batting.length > 0 && (
                      <div style={{ marginTop: 10, fontSize: 13, color: '#ddd' }}>
                        <strong>Recent batting:</strong>{' '}
                        {playerStats.batting[0].season ? `${playerStats.batting[0].season}` : ''}
                        {playerStats.batting[0].avg ? ` — AVG ${playerStats.batting[0].avg}` : ''}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </main>
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      <main style={{ padding: 40, background: '#0c0c0c', color: '#f2f2f2' }}>
        <h1>Unexpected error</h1>
        <pre style={{ whiteSpace: 'pre-wrap', color: '#f88' }}>{msg}</pre>
      </main>
    );
  }
}
