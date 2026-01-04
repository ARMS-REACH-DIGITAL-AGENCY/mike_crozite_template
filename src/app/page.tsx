// src/app/page.tsx
export const runtime = 'nodejs';

import { headers } from 'next/headers';
import { pool } from '../lib/db';

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
          Visit a school microsite by adding the HSID as subdomain, e.g., <strong>5004.yatstats.com</strong>
        </p>
      </main>
    );
  }

  try {
    // use the shared pool exported from src/lib/db.ts
    // (this avoids creating multiple Pool instances in serverless)
    if (!pool) {
      throw new Error('Database pool is not available');
    }

    // 1) School lookup by HSID
    const schoolQuery = await pool.query(
      'SELECT * FROM public.tbc_schools_raw WHERE hsid = $1 LIMIT 1',
      [hsid]
    );
    const school: AnyRow | undefined = schoolQuery.rows?.[0];

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

    // 2) Players by high_school lookup key
    const playersQuery = await pool.query(
      'SELECT * FROM public.tbc_players_raw WHERE high_school = $1',
      [hs_lookup_key]
    );
    const players: AnyRow[] = playersQuery.rows || [];

    // 3) Stats per player (batting + pitching) — batched (no N+1)
    const playerIds = players.map((p) => p.playerid).filter(Boolean);

    const [battingRows, pitchingRows] = await Promise.all([
      playerIds.length
        ? pool
            .query('SELECT * FROM public.tbc_batting_raw WHERE playerid = ANY($1::text[])', [playerIds])
            .then((r) => r.rows || [])
        : Promise.resolve([] as AnyRow[]),
      playerIds.length
        ? pool
            .query('SELECT * FROM public.tbc_pitching_raw WHERE playerid = ANY($1::text[])', [playerIds])
            .then((r) => r.rows || [])
        : Promise.resolve([] as AnyRow[]),
    ]);

    const battingById = new Map<string, AnyRow>();
    for (const row of battingRows) battingById.set(String(row.playerid), row);

    const pitchingById = new Map<string, AnyRow>();
    for (const row of pitchingRows) pitchingById.set(String(row.playerid), row);

    const playerData = players.map((player) => {
      const id = String(player.playerid);
      return {
        ...player,
        batting: battingById.get(id) || null,
        pitching: pitchingById.get(id) || null,
      };
    });

    const schoolName = safeText(school.hsname) || 'School';
    const city = safeText(school.cityname);
    const region = safeText(school.regionname);

    return (
      <main
        style={{
          background: '#0c0c0c',
          color: '#f2f2f2',
          padding: 20,
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
        }}
      >
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: '2.25rem', margin: 0 }}>{schoolName} ACTIVE BASEBALL ALUMNI</h1>
          <p style={{ marginTop: 8, opacity: 0.85 }}>
            {city}
            {city && region ? ', ' : ''}
            {region}
          </p>
        </header>

        {playerData.length === 0 ? (
          <p style={{ opacity: 0.85 }}>No players found for this school.</p>
        ) : (
          <div className="grid">
            {playerData.map((player) => {
              const batting = player.batting || {};
              const pitching = player.pitching || {};

              const first = safeText(player.firstname);
              const last = safeText(player.lastname);
              const team = safeText(player.team);
              const photo = safeText(player.photo_url) || '/placeholder.jpg';

              const lastgame = safeText(batting.lastgame) || safeText(pitching.lastgame) || 'N/A';

              const avg = batting.avg ?? batting.bavg ?? null;
              const hr = batting.hr ?? null;

              const era = pitching.era ?? null;
              const k = pitching.k ?? pitching.so ?? null;

              return (
                <div key={player.playerid} className="card" title={`${first} ${last}`.trim()}>
                  <div className="inner">
                    <div className="front">
                      <img
  src={photo}
  alt={`${first} ${last}`.trim() || 'Player'}
  style={{
    width: '100%',
    height: 200,
    objectFit: 'cover',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  }}
/>

