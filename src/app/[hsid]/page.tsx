// src/app/[hsid]/page.tsx

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSchoolByHsid, getRosterByHsid, getSchoolByUrl } from "@/lib/db";

export const runtime = "nodejs";

function headerLine1(school: any) {
  // Already formatted the way you want (e.g., "Chandler, AZ")
  return (school?.hslocation || "").toString();
}

function headerLine2(school: any) {
  const name = (school?.hsname || "").toString();
  return name ? `${name} HIGH SCHOOL` : "";
}

export async function generateMetadata({
  params,
}: {
  params: { hsid: string };
}): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const hostUrl = host ? `https://${host}` : "";

  const school = hostUrl
    ? await getSchoolByUrl(hostUrl)
    : await getSchoolByHsid(params.hsid);

  const l1 = headerLine1(school);
  const l2 = headerLine2(school);

  const title =
    l2 && l1 ? `${l2} — ${l1} — ACTIVE BASEBALL ALUMNI` : "YAT?STATS Microsite";

  return { title };
}

export default async function SchoolPage({
  params,
}: {
  params: { hsid: string };
}) {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const hostUrl = host ? `https://${host}` : "";

  // Prefer resolving by host (e.g., 5004.yatstats.com), otherwise fall back to /[hsid]
  const school = hostUrl
    ? await getSchoolByUrl(hostUrl)
    : await getSchoolByHsid(params.hsid);

  if (!school) {
    redirect("https://yatstats.com");
  }

  const resolvedHsid = String(school.hsid ?? params.hsid);
  const roster = await getRosterByHsid(resolvedHsid);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Sticky header */}
      <header className="sticky top-0 z-50 bg-black/90 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 text-center">
          <div className="text-sm tracking-wide opacity-80 uppercase">
            {headerLine1(school)}
          </div>

          <div className="text-2xl sm:text-3xl font-extrabold leading-tight uppercase">
            {headerLine2(school)}
          </div>

          <div className="text-lg sm:text-xl font-extrabold uppercase">
            ACTIVE BASEBALL ALUMNI
          </div>
        </div>
      </header>

      {/* Player gallery */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {roster.length > 0 ? (
            roster.map((player: any) => (
              <div key={player.playerid} className="flip-card">
                <div className="flip-card-inner">
                  <div className="flip-card-front bg-gray-900 rounded-xl shadow-lg flex flex-col items-center justify-center p-6">
                    <h2 className="text-xl font-semibold text-center">
                      {player.player_name}
                    </h2>

                    {!!player.highlevel && (
                      <div className="text-xs opacity-70 mt-2">
                        {player.highlevel}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full text-center opacity-70">
              No active players found.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
