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

export default async function Home() {
  const headerList = headers();
  const host = headerList.get('host') || 'yatstats.com';
  const hsid = host.split('.')[0] || 'yatstats';

  // Root domain
  if (hsid === 'yatstats') {
    return (
      <main
        style={{
          padding: 40,
          textAlign: 'center',
          background: '#0c0c0c',
          color: '#f2f2f2',
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
        }}
      >
        <h1 style={{ marginBottom: 12 }}>Welcome to YATSTATS</h1>
        <p style={{ margin: 0 }}>
          Visit a school microsite using a subdomain, e.g.{' '}
          <strong>5004.yatstats.com</strong>
        </p>
      </main>
    );
  }

  try {
    const pool = getPool();

    // School
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
          <h1>School missing lookup key</h1>
        </main>
      );
    }

    // Players
    const playersQuery = await pool.query(
      'SELECT * FROM public.tbc_players_raw WHERE high_school = $1',
      [hs_lookup_key]
    );
    const players = playersQuery.rows || [];

    const playerData = await Promise.all(
      players.map(async (player) => {
        const playerid = player.playerid;

        const [battingQuery, pitchingQuery] = await Promise.all([
          pool.query(
            'SELECT * FROM public.tbc_batting_raw WHERE playerid = $1 LIMIT 1',
            [playerid]
          ),
          pool.query(
            'SELECT * FROM public.tbc_pitching_raw WHERE playerid = $1 LIMIT 1',
            [playerid]
          ),
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
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
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
          <p>No players found.</p>
        ) : (
          <div className="grid">
            {playerData.map((player) => {
              const batting = player.batting || {};
              const pitching = player.pitching || {};

              const first = safeText(player.firstname);
              const last = safeText(player.lastname);
              const team = safeText(player.team);
              const photo = safeText(player.photo_url) || '/placeholder.jpg';

              const lastgame =
                safeText(batting.lastgame) ||
                safeText(pitching.lastgame) ||
                'N/A';

              const avg = batting.avg ?? batting.bavg ?? 'N/A';
              const hr = batting.hr ?? 'N/A';
              const era = pitching.era ?? 'N/A';
              const k = pitching.k ?? pitching.so ?? 'N/A';

              return (
                <div key={player.playerid} className="card">
                  <div className="inner">
                    <div className="front">
                      <img
                        src={photo}
                        alt={`${first} ${last}`}
                        style={{
                          width: '100%',
                          height: 200,
                          objectFit: 'cover',
                        }}
                      />
                      <div style={{ padding: 12 }}>
                        <h2 style={{ margin: 0 }}>
                          {first} {last}
                        </h2>
                        <p style={{ opacity: 0.9 }}>{team || '—'}</p>
                        <p style={{ opacity: 0.8 }}>
                          Last Game: {lastgame}
                        </p>
                        <p style={{ fontSize: 12, opacity: 0.7 }}>
                          Hover to flip
                        </p>
                      </div>
                    </div>

                    <div className="back">
                      <div style={{ padding: 12 }}>
                        <h2>Stats</h2>
                        <p>
                          Batting: AVG {avg}, HR {hr}
                        </p>
                        <p>
                          Pitching: ERA {era}, K {k}
                        </p>
                        <p style={{ fontSize: 12, opacity: 0.7 }}>
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
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            gap: 20px;
            align-items: start;
          }

          .card {
            width: 100%;
            max-width: 320px;
            height: 400px;
            perspective: 1000px;
            justify-self: center;
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
        <p>{message}</p>
      </main>
    );
  }
}
