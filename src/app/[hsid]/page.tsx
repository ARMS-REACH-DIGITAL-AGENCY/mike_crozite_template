// src/app/[hsid]/page.tsx
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSchoolByHsid, getRosterByHsid, getSchoolByUrl, getRosterByHighSchool } from '@/lib/db';

export default async function SchoolPage({ params }: { params: { hsid: string } }) {
  // Get host from request headers
  const headersList = await headers();
  const host = headersList.get('host') || '';

  // Try to find school by staging or microsite URL
  let school = await getSchoolByUrl(host);
  let roster;

  if (school) {
    // If found via URL, fetch roster by high_school
    roster = await getRosterByHighSchool(school.high_school);
  } else {
    // Fallback: use numeric hsid from route
    const hsid = params.hsid;
    school = await getSchoolByHsid(hsid);
    if (!school) {
      redirect('https://yatstats.com');
    }
    roster = await getRosterByHsid(hsid);
  }

  return (
    <div className="container mx-auto p-4 bg-black text-white">
      <h1 className="text-4xl font-bold mb-6 text-center">
        {school.school_name} Active Baseball Alumni
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {roster.map((player: any) => (
          <div key={player.player_id} className="flip-card">
            <div className="flip-card-inner">
              <div className="flip-card-front bg-gray-900 rounded-xl shadow-lg flex flex-col items-center justify-center p-6">
                <h2 className="text-2xl font-semibold mb-2">{player.name}</h2>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
