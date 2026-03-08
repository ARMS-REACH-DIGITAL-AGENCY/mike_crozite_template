// src/app/[hsid]/next-level-all-time-list/page.tsx
// YAT?STATS — School microsite: NEXT-LEVEL ALL-TIME LIST section

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAllTimeRosterByHsid } from "@/lib/db";
import SchoolShell from "@/components/SchoolShell";
import PlayerCard from "@/components/PlayerCard";
import { getSchoolPageData } from "@/lib/schoolPageData";
import { getCanonicalBaseUrl } from "@/lib/canonicalUrl";
import { gradClass } from "@/lib/playerUtils";

export const runtime = "nodejs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hsid: string }>;
}): Promise<Metadata> {
  const { hsid } = await params;
  const data = await getSchoolPageData(hsid);
  if (!data) return { title: "Next-Level All-Time List | YAT?STATS" };
  const { schoolName, school, resolvedHsid } = data;
  const canonicalBase = getCanonicalBaseUrl(school, resolvedHsid);
  return {
    title: `NEXT-LEVEL ALL-TIME LIST | ${schoolName} | YAT?STATS`,
    description: `All-time baseball alumni from ${schoolName}.`,
    alternates: { canonical: `${canonicalBase}/next-level-all-time-list` },
  };
}

export default async function NextLevelAllTimeListPage({
  params,
}: {
  params: Promise<{ hsid: string }>;
}) {
  const { hsid } = await params;
  const data = await getSchoolPageData(hsid);
  if (!data) redirect("https://yatstats.com");

  const { schoolName, location, crestUrl, resolvedHsid, subdomain, navBase, canonicalBase } = data;
  const allTimeRoster = await getAllTimeRosterByHsid(resolvedHsid);
  const photoDefaultUrl = `${canonicalBase}/assets/img/now_players/default.jpg`;

  const gradClasses = Array.from(
    new Set(
      (allTimeRoster as Record<string, unknown>[]).map((p) => gradClass(p)).filter(Boolean)
    )
  )
    .sort()
    .reverse();

  return (
    <SchoolShell
      schoolName={schoolName}
      location={location}
      crestUrl={crestUrl}
      resolvedHsid={resolvedHsid}
      subdomain={subdomain}
      navBase={navBase}
      sectionLabel="NEXT-LEVEL ALL-TIME LIST"
      gradClasses={gradClasses}
    >
      <section className="yat-section visible" id="sec-alltime">
        <div className="yat-grid" id="alltime-grid">
          {(allTimeRoster as Record<string, unknown>[]).length === 0 ? (
            <div className="yat-empty">
              <div className="yat-empty-icon">⚾</div>
              <div className="yat-empty-title">No alumni found</div>
              <div className="yat-empty-sub">Check back as we continue building the database</div>
            </div>
          ) : (
            (allTimeRoster as Record<string, unknown>[]).map((p) => (
              <PlayerCard
                key={String(p.playerid)}
                p={p}
                resolvedHsid={resolvedHsid}
                photoDefaultUrl={photoDefaultUrl}
                variant="alltime"
              />
            ))
          )}
        </div>
      </section>
    </SchoolShell>
  );
}
