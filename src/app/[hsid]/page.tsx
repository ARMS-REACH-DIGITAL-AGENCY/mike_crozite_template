// src/app/[hsid]/page.tsx

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import {
  getSchoolByHsid,
  getRosterByHsid,
  getSchoolByUrl,
  getRosterByHighSchool,
} from '@/lib/db';

export default async function SchoolPage({
  params,
}: {
  params: { hsid: string };
}) {
  // Read host (staging_url or microsite_url)
  const headersList = await headers();
  const host = headersList.get('host') || '';

  // Try URL-based lookup first (staging + microsite)
  let school = await getSchoolByUrl(host);
  let roster;

  if (school) {
    roster = await getRosterByHighSchool(school.high_school);
  } else {
    // Fallback to numeric hsid route
    const hsid = params.hsid;
    school = await getSchoolByHsid(hsid);

    if (!school) {
      redirect('https://yatstats.com');
    }

    roster = await getRosterByHsid(hsid);
  }

  return (
    <div className="container mx-auto p-4 bg-black text-white">
      {/* GLOBAL HEADER */}
      <header className="mb-8 text-center">
        <div className="text-sm opacity-70">
          {school.city}, {school.state}
        </div>

        <div className="text-2xl font-semibold">
          {school.school_name}
        </div>
      </header>

      {/* PLAYER CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {roster.map((player: any) => (
          <div key={player.player_id} className="flip-card">
            <div className="flip-card-inner">
              <div className="flip-card-front bg-gray-900 rounded-xl shadow-lg flex flex-col items-center justify-center p-6">
                <h2 className="text-xl font-semibold">
                  {player.name}
                </h2>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
