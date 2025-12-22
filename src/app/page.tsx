export const runtime = 'nodejs';

import { headers } from 'next/headers';
import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __yatstatsPool: Pool | undefined;
}

function getPool() {
  if (!global.__yatstatsPool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }

    global.__yatstatsPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Keep this as you had it; adjust later if you switch to a managed Postgres that needs different SSL behavior.
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  return global.__yatstatsPool;
}

function safeText(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function safeNum(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default async function Home() {
  const headerList = headers();
  const host = headerList.get('host') || 'yatstats.com';
  const hsid = host.split('.')[0] || 'yatstats';

  // Main domain (no HSID subdomain)
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
    const pool = getPool();

    // 1) School lookup by HSID
    const schoolQuery = await pool.query(
      'SELECT * FROM public.tbc_schools_raw WHERE hsid = $1 LIMIT 1',
      [hsid]
    );
    const school = schoolQuery.rows?.[0];

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
    const players = playersQuery.rows || [];

    // 3) Stats per player (batting + pitching)
    // NOTE: This is N+1 queries. Fine for a prototype; optimize later by batching.
    const playerData = await Promise.all(
      players.map(async (player) => {
        const playerid = player.playerid;

        const [battingQuery, pitchingQuery] = await Promise.all([
          pool.query('SELECT * FROM public.tbc_batting_raw WHERE playerid = $1 LIMIT 1', [playerid]),
          pool.query('SELECT * FROM public.tbc_pitching_raw WHERE playerid = $1 LIMIT 1', [playerid]),
        ]);

        return {
          ...player,
          batting: battingQuery.rows?.[0] || null,
          pitching: pitchingQuery.rows?.[0] || null,
        };
      })
    );

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
          <h1 style={{ fontSize: '2.25rem', margin: 0 }}>
            {schoolName} ACTIVE BASEBALL ALUMNI
          </h1>
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
                <div key={player.playerid} className="card" title={`${first} ${last}`}>
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
                      <div style={{ padding: 12 }}>
                        <h2 style={{ margin: '6px 0 4px 0', fontSize: '1.25rem' }}>
                          {first} {last}
                        </h2>
                        <p style={{ margin: '0 0 6px 0', opacity: 0.9 }}>{team || '—'}</p>
                        <p style={{ margin: 0, opacity: 0.8 }}>Last Game: {lastgame}</p>
                        <p style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
                          Hover to flip
                        </p>
                      </div>
                    </div>

                    <div className="back">
                      <div style={{ padding: 12 }}>
                        <h2 style={{ margin: '6px 0 10px 0', fontSize: '1.25rem' }}>Stats</h2>

                        <p style={{ margin: '0 0 8px 0', opacity: 0.9 }}>
                          Batting: AVG {safeText(avg ?? 'N/A')}, HR {safeText(hr ?? 'N/A')}
                        </p>

                        <p style={{ margin: 0, opacity: 0.9 }}>
                          Pitching: ERA {safeText(era ?? 'N/A')}, K {safeText(k ?? 'N/A')}
                        </p>

                        <p style={{ marginTop: 14, opacity: 0.7, fontSize: 12 }}>
                          Hover off to flip back
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <style jsx>{`
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
          }

          .card {
            width: 300px;
            height: 400px;
            perspective: 1000px;
          }

          .inner {
            position: relative;
            width: 100%;
            height: 100%;
            transform-style: preserve-3d;
            transition: transform 0.6s;
          }

          .card:hover .inner {
            transform: rotateY(180deg);
          }

          .front,
          .back {
            position: absolute;
            width: 100%;
            height: 100%;
            backface-visibility: hidden;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
            background: #111;
          }

          .back {
            transform: rotateY(180deg);
            background: #1a1a1a;
          }
        `}</style>
      </main>
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return (
      <main style={{ padding: 40, background: '#0c0c0c', color: '#f2f2f2' }}>
        <h1>Error loading microsite</h1>
        <p style={{ opacity: 0.85, marginTop: 12 }}>{message}</p>
      </main>
    );
  }
}
