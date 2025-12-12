import { Metadata } from 'next';
import Image from 'next/image';

interface School {
  hsid: string;
  schoolname: string;
  city: string;
  state: string;
  tagline?: string;
  crestimage?: string;
}

interface Player {
  playerid: string;
  firstname: string;
  lastname: string;
  position: string;
  gradyear: number;
}

async function getSchool(hsid: string): Promise<School | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/schools/${hsid}`, {
      cache: 'revalidate',
      next: { revalidate: 3600 }, // Cache for 1 hour
    });
    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    console.error('Error fetching school:', error);
    return null;
  }
}

async function getPlayers(hsid: string): Promise<Player[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/players/${hsid}`, {
      cache: 'revalidate',
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch (error) {
    console.error('Error fetching players:', error);
    return [];
  }
}

export async function generateMetadata(
  { params }: { params: { hsid: string } }
): Promise<Metadata> {
  const school = await getSchool(params.hsid);
  const title = school ? `${school.schoolname} - YatStats` : 'YatStats';
  return {
    title,
    description: school?.tagline || 'School stats and player information',
  };
}

export default async function SchoolPage({
  params,
}: {
  params: { hsid: string };
}) {
  const { hsid } = params;
  const school = await getSchool(hsid);
  const players = await getPlayers(hsid);

  if (!school) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">School Not Found</h1>
          <p className="text-gray-600">Unable to find school with HSID: {hsid}</p>
        </div>
      </div>
    );
  }

  const crestPath = `/assets/img/schools/${hsid}.png`;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* School Header */}
      <section className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
            {/* Crest */}
            <div className="flex justify-center md:justify-start">
              <div className="relative w-32 h-32">
                <Image
                  src={crestPath}
                  alt={`${school.schoolname} Crest`}
                  fill
                  className="object-contain"
                  onError={(e) => {
                    // Fallback if image not found
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            </div>

            {/* School Info */}
            <div className="md:col-span-2">
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                {school.schoolname}
              </h1>
              <p className="text-lg text-gray-600 mb-4">
                {school.city}, {school.state}
              </p>
              {school.tagline && (
                <p className="text-base text-gray-700 italic">
                  {school.tagline}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Players Gallery */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">Players</h2>

        {players.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No players found for this school.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {players.map((player) => (
              <div
                key={player.playerid}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow duration-200 p-6"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {player.firstname} {player.lastname}
                </h3>
                <dl className="space-y-2 text-sm text-gray-600">
                  <div>
                    <dt className="font-medium text-gray-700">Position</dt>
                    <dd>{player.position}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-700">Grad Year</dt>
                    <dd>{player.gradyear}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
