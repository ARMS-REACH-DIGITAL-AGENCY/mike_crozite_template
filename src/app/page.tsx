import { headers } from 'next/headers';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function Home() {
  const headerList = headers();
  const host = headerList.get('host') || 'yatstats.com';
  const hsid = host.split('.').[0];  // e.g., '5004' from '5004.yatstats.com'

  if (hsid === 'yatstats') {  // Fallback for main domain
    return (
      <main style={{ padding: '40px', textAlign: 'center', background: '#0c0c0c', color: '#f2f2f2' }}>
        <h1>Welcome to YATSTATS</h1>
        <p>Visit a school microsite by adding the HSID as subdomain, e.g., 5004.yatstats.com</p>
      </main>
    );
  }

  try {
    // Step 1: Get school info from tbc_schools_raw using hsid
    const schoolQuery = await pool.query(
      'SELECT * FROM public.tbc_schools_raw WHERE hsid = $1',
      [hsid]
    );
    const school = schoolQuery.rows[0] || {};
    const hs_lookup_key = school.hs_lookup_key || '';

    if (!hs_lookup_key) {
      return <main><h1>No school found for HSID {hsid}</h1></main>;
    }

    // Step 2: Get players from tbc_players_raw using high_school = hs_lookup_key
    const playersQuery = await pool.query(
      'SELECT * FROM public.tbc_players_raw WHERE high_school = $1',
      [hs_lookup_key]
    );
    const players = playersQuery.rows || [];

    // Step 3: For each player, get batting and pitching stats using playerid
    const playerData = await Promise.all(players.map(async (player) => {
      const battingQuery = await pool.query(
        'SELECT * FROM public.tbc_batting_raw WHERE playerid = $1',
        [player.playerid]
      );
      const pitchingQuery = await pool.query(
        'SELECT * FROM public.tbc_pitching_raw WHERE playerid = $1',
        [player.playerid]
      );
      return {
        ...player,
        batting: battingQuery.rows[0] || {},
        pitching: pitchingQuery.rows[0] || {},
      };
    }));

    // Render the prototype-like gallery (flip cards with player info and stats)
    return (
      <main style={{ background: '#0c0c0c', color: '#f2f2f2', padding: '20px', fontFamily: 'Oswald' }}>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: '3rem' }}>{school.hsname || 'School'} ACTIVE BASEBALL ALUMNI</h1>
        <p>{school.cityname}, {school.regionname}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          {playerData.map((player) => (
            <div key={player.playerid} style={{ position: 'relative', width: '300px', height: '400px' }}>
              {/* Front Side */}
              <div style={{ backfaceVisibility: 'hidden', position: 'absolute', width: '100%', height: '100%', transform: 'rotateY(0deg)', transition: 'transform 0.6s' }}>
                <img src={player.photo_url || 'placeholder.jpg'} alt={player.firstname} style={{ width: '100%', height: '200px', objectFit: 'cover' }} />
                <h2>{player.firstname} {player.lastname}</h2>
                <p>{player.team}</p>
                <p>Last Game: {player.batting.lastgame || player.pitching.lastgame}</p>
              </div>
              {/* Back Side (Stats) */}
              <div style={{ backfaceVisibility: 'hidden', position: 'absolute', width: '100%', height: '100%', transform: 'rotateY(180deg)', transition: 'transform 0.6s', background: '#1a1a1a', padding: '10px' }}>
                <h2>Stats</h2>
                <p>Batting: AVG {player.batting.avg || 'N/A'}, HR {player.batting.hr || 'N/A'}</p>
                <p>Pitching: ERA {player.pitching.era || 'N/A'}, K {player.pitching.k || 'N/A'}</p>
                {/* Add more stats as per DB fields */}
                <p>Flip back for info</p>
              </div>
            </div>
          ))}
        </div>

        {/* Add CSS for flip effect in global.css or inline */}
        <style jsx>{`
          div:hover > div:first-child {
            transform: rotateY(180deg);
          }
          div:hover > div:last-child {
            transform: rotateY(0deg);
          }
        `}</style>
      </main>
    );
  } catch (error) {
    console.error(error);
    return <main><h1>Error loading microsite</h1></main>;
  }
}
