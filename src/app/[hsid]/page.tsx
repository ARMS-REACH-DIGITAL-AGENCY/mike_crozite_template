// src/app/[hsid]/page.tsx (minimal flip card grid, names only)
import { getSchoolByHsid, getRosterByHsid } from '@/lib/db'; // Adjust path if needed

export default async function SchoolPage({ params }: { params: { hsid: string } }) {
  const hsid = params.hsid;
  const school = await getSchoolByHsid(hsid);
  const roster = await getRosterByHsid(hsid);

  if (!school) {
    return <div>School not found</div>;
  }

  return (
    <div className="container mx-auto p-4 bg-black text-white">
      <h1 className="text-4xl font-bold mb-6 text-center">{school.school_name} Active Baseball Alumni</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {roster.map((player) => (
          <div key={player.player_id} className="flip-card">
            <div className="flip-card-inner">
              <div className="flip-card-front bg-gray-900 rounded-xl shadow-lg flex flex-col items-center justify-center p-6">
                <h2 className="text-2xl font-semibold mb-2">{player.name}</h2>
                <p className="text-sm mt-2">Flip for more!</p>
              </div>
              <div className="flip-card-back bg-gray-800 rounded-xl shadow-lg flex flex-col items-center justify-center p-6">
                <h2 className="text-2xl font-semibold mb-2">{player.name}</h2>
                <p>Details coming soon!</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}