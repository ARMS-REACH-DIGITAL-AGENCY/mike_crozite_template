import Image from 'next/image';

interface Player {
  playerid: number;
  firstname: string;
  lastname: string;
  position: string;
  gradyear: string;
  letter_years?: string;
  status?: string;
  level?: string;
  team?: string;
  org?: string;
}

interface School {
  hsid: string;
  school_name: string;
  school_name_upper?: string;
  city_state?: string;
  tagline?: string;
}

async function getSchool(hsid: string): Promise<School | null> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const res = await fetch(`${base}/api/schools/${hsid}`, { cache: 'no-store' });
  return res.ok ? res.json() : null;
}

async function getPlayers(hsid: string): Promise<Player[]> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const res = await fetch(`${base}/api/players/${hsid}`, { cache: 'no-store' });
  return res.ok ? res.json() : [];
}

export default async function MicrositePage({
  params,
}: {
  params: Promise<{ hsid: string }>;
}) {
  const { hsid } = await params;
  const [school, players] = await Promise.all([getSchool(hsid), getPlayers(hsid)]);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      {school ? (
        <header className="mb-12 text-center">
          <Image
            src={`/assets/img/schools/${hsid}.png`}
            alt={`${school.school_name} crest`}
            width={120}
            height={120}
            className="mx-auto mb-4"
            priority
            onError={(e) => ((e.currentTarget as HTMLImageElement).src = '/assets/img/placeholder.png')}
          />
          <h1 className="text-4xl font-bold">{school.school_name_upper || school.school_name}</h1>
          {school.city_state && <p className="text-xl text-gray-600">{school.city_state}</p>}
          {school.tagline && <p className="text-2xl italic mt-2">{school.tagline}</p>}
        </header>
      ) : (
        <header className="mb-12 text-center">
          <p className="text-2xl text-red-600">School not found (HSID: {hsid})</p>
        </header>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
        {players.length > 0 ? (
          players.map((player) => (
            <div key={player.playerid} className="border rounded-lg p-6 bg-white shadow text-center">
              <div className="bg-gray-200 border-2 border-dashed rounded-xl w-32 h-32 mx-auto mb-4" />
              <h3 className="text-xl font-semibold">
                {player.firstname} {player.lastname}
              </h3>
              <p className="text-gray-600">{player.position || 'Position TBD'}</p>
              <p className="text-sm text-gray-500">Class of {player.gradyear}</p>
            </div>
          ))
        ) : (
          <p className="col-span-full text-center text-gray-500">No players found for this school.</p>
        )}
      </section>
    </div>
  );
}
