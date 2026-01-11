// src/app/[hsid]/page.tsx

/*
 * Dynamic high school page for microsites
 *
 * This server component renders data for a specific high school based
 * on its HSID, which is extracted from the subdomain by the
 * `middleware.ts` at the project root.
 *
 * IMPORTANT:
 * - This version does NOT call internal API routes via fetch().
 * - It calls lib/db.ts helpers directly to avoid SSR/build-time fetch failures.
 * - If the HSID is invalid, it redirects to https://yatstats.com.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSchoolByHsid, getRosterByHsid, getStatsForPlayers } from '@/lib/db';

interface PageProps {
  params: { hsid: string };
}

export default async function HsidPage({ params }: PageProps) {
  const { hsid } = params;

  const school = await getSchoolByHsid(hsid);

  // If school not found (typo HSID, not in the 1024 list, etc.), route to homepage.
  if (!school) {
    redirect('https://yatstats.com');
  }

  const roster = await getRosterByHsid(hsid);
  const playerIds = roster.map((p: any) => p.playerid).filter(Boolean);
  const statsMap = await getStatsForPlayers(playerIds);

  return (
    <main>
      {/* Import prototype fonts and icons */}
      <link
        href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css"
        rel="stylesheet"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Oswald:wght@300;400&family=Bebas+Neue&display=swap"
        rel="stylesheet"
      />

      {/* Basic dark theme variables and card styles based off the prototype */}
      <style>{`
        :root {
          --bg: #0c0c0c;
          --fg: #f2f2f2;
          --card-bg: #171717;
          --line: rgba(255,255,255,0.08);
          --shade-end: rgba(0,0,0,0.95);
        }
        body {
          background: var(--bg);
          color: var(--fg);
          font-family: Oswald, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
          margin: 0;
        }
        .hs-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1rem;
        }
        .grid {
          display: grid;
          gap: 1rem;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        }
        .card {
          position: relative;
          background: var(--card-bg);
          border-radius: 0;
          overflow: hidden;
          box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }
        .card::before {
          content: "";
          display: block;
          padding-top: 140%;
        }
        .card-content {
          position: absolute;
          inset: 0;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          background-image: linear-gradient(to bottom, transparent, var(--shade-end));
          background-color: #222;
        }
        .card-content h3 {
          margin: 0 0 0.5rem;
          font-family: "Bebas Neue", sans-serif;
          letter-spacing: .02em;
          font-size: 1.5rem;
        }
        .meta {
          font-size: 0.8rem;
          opacity: 0.85;
        }
      `}</style>

      <div className="hs-container">
        <header style={{ padding: '1.5rem 0', borderBottom: '1px solid var(--line)' }}>
          <h1
            style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: '2rem',
              letterSpacing: '.05em',
              margin: 0,
            }}
          >
            {school.school_name}
          </h1>
        </header>

        {roster.length ? (
          <section style={{ padding: '1.5rem 0' }}>
            <h2
              style={{
                fontFamily: '"Bebas Neue", sans-serif',
                fontSize: '1.6rem',
                marginBottom: '1rem',
              }}
            >
              Players
            </h2>

            <div className="grid">
              {roster.map((player: any) => {
                const nameParts = (player.player_name || '').split(' ');
                const firstName = nameParts[0] ?? '';
                const lastName = nameParts.slice(1).join(' ') ?? '';

                const playerStats = statsMap?.[player.playerid] ?? { batting: [], pitching: [] };

                return (
                  <article className="card" key={player.playerid ?? player.pid ?? player.id}>
                    <div className="card-content">
                      <h3>
                        {firstName && lastName ? (
                          <>
                            <span style={{ display: 'block' }}>{firstName}</span>
                            <span style={{ display: 'block' }}>{lastName}</span>
                          </>
                        ) : (
                          player.player_name ?? 'Unnamed Player'
                        )}
                      </h3>

                      <div className="meta">
                        <div>{player.team ?? ''}</div>
                        <div>{player.level ?? ''}</div>
                        <div>{player.grad_class ? `Class of ${player.grad_class}` : ''}</div>
                      </div>

                      {playerStats.batting?.length > 0 && (
                        <div style={{ marginTop: 8, fontSize: '0.8rem' }}>
                          Batting: AVG {playerStats.batting[0]?.avg ?? 'N/A'}
                        </div>
                      )}

                      {playerStats.pitching?.length > 0 && (
                        <div style={{ fontSize: '0.8rem' }}>
                          Pitching: ERA {playerStats.pitching[0]?.era ?? 'N/A'}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <p style={{ padding: '1.5rem 0' }}>No players found for this school.</p>
        )}
      </div>
    </main>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return {
    title: `High School ${params.hsid} Stats`,
    description: `Statistics and player information for high school ${params.hsid}.`,
  };
}