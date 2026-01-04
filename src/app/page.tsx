/*
 * Dynamic high school page for microsites
 *
 * This server component renders data for a specific high school based
 * on its HSID, extracted from the subdomain by middleware.ts. It pulls from
 * authoritative Neon tables (school_success for school metadata, hs_rosters_simple for roster)
 * via lib/db.ts helpers, and displays in simple HTML layout. Replace with charts/tables later
 * for more elaborate pages. This confirms routing and data loading from the correct sources.
 */
import Head from 'next/head';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

interface PageProps {
  params: { hsid: string };
}

export default async function HsidPage({ params }: PageProps) {
  const { hsid } = params;

  // Pull school metadata from school_success
  const school = await getSchoolByHsid(hsid);

  // Redirect if no school found (invalid HSID or root domain)
  if (!school) {
    redirect('https://yatstats.com');
  }

  // Pull roster from hs_rosters_simple
  const roster = await getRosterByHsid(hsid);
  const playerIds = roster.map((p) => p.playerid).filter(Boolean);
  const statsMap = await getStatsForPlayers(playerIds);

  return (
    <>
      <Head>
        {/* Import prototype fonts and icons */}
        <link
          href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@300;400&family=Bebas+Neue&display=swap"
          rel="stylesheet"
        />
        {/* Basic dark/light theme variables and card styles based off the prototype */}
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
          }
          .card-content h3 {
            margin: 0 0 0.5rem;
            font-family: "Bebas Neue", sans-serif;
            letter-spacing: .02em;
            font-size: 1.5rem;
          }
          .card-content .meta {
            font-size: 0.8rem;
            opacity: 0.85;
          }
        `}</style>
      </Head>
      <main>
        <div className="hs-container">
          {/* Heading from school_success */}
          <header style={{ padding: '1.5rem 0', borderBottom: '1px solid var(--line)' }}>
            <h1 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '2rem', letterSpacing: '.05em' }}>
              {school.school_name ?? `High School ${hsid}`}
            </h1>
          </header>
          {/* Players grid from hs_rosters_simple */}
          {roster.length ? (
            <section style={{ padding: '1.5rem 0' }}>
              <h2 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1.6rem', marginBottom: '1rem' }}>
                Players
              </h2>
              <div className="grid">
                {roster.map((player: any) => {
                  const nameParts = (player.player_name || '').split(' ');
                  const firstName = nameParts[0] ?? '';
                  const lastName = nameParts.slice(1).join(' ') ?? '';
                  const photo = player.photo || player.photo_url || player.image_url || '/images/placeholder-player.png';
                  const playerStats = statsMap[player.playerid] ?? { batting: [], pitching: [] };
                  return (
                    <article className="card" key={player.playerid}>
                      <div
                        className="card-content"
                        style={{
                          backgroundImage: `linear-gradient(to bottom, transparent, var(--shade-end))`,
                          backgroundSize: 'cover',
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'center',
                          backgroundColor: '#222'
                        }}
                      >
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
                        {/* Basic stats if available */}
                        {playerStats.batting.length > 0 && (
                          <div style={{ marginTop: 8, fontSize: '0.8rem' }}>
                            Batting: AVG {playerStats.batting[0].avg || 'N/A'}
                          </div>
                        )}
                        {playerStats.pitching.length > 0 && (
                          <div style={{ fontSize: '0.8rem' }}>
                            Pitching: ERA {playerStats.pitching[0].era || 'N/A'}
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
    </>
  );
}

/**
 * Optionally provide metadata for the dynamic page. This can
 * improve SEO and provide better sharing previews. Here we set
 * the title using the HSID; you could fetch more detailed
 * metadata from the school API or database.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { hsid } = params;
  return {
    title: `High School ${hsid} Stats`,
    description: `Statistics and player information for high school ${hsid}.`,
  };
}
