// src/app/[hsid]/current-team/page.tsx
// YAT?STATS — School microsite: CURRENT TEAM section

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SchoolShell from "@/components/SchoolShell";
import { getSchoolPageData } from "@/lib/schoolPageData";

export const runtime = "nodejs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hsid: string }>;
}): Promise<Metadata> {
  const { hsid } = await params;
  const data = await getSchoolPageData(hsid);
  if (!data) return { title: "Current Team | YAT?STATS" };
  const { schoolName, canonicalBase } = data;
  return {
    title: `CURRENT TEAM | ${schoolName} | YAT?STATS`,
    description: `Current varsity roster for ${schoolName}.`,
    alternates: { canonical: `${canonicalBase}/current-team` },
  };
}

export default async function CurrentTeamPage({
  params,
}: {
  params: Promise<{ hsid: string }>;
}) {
  const { hsid } = await params;
  const data = await getSchoolPageData(hsid);
  if (!data) redirect("https://yatstats.com");

  const { schoolName, location, crestUrl, resolvedHsid, subdomain, navBase } = data;

  return (
    <SchoolShell
      schoolName={schoolName}
      location={location}
      crestUrl={crestUrl}
      resolvedHsid={resolvedHsid}
      subdomain={subdomain}
      navBase={navBase}
      sectionLabel="CURRENT TEAM"
    >
      <section className="yat-section visible" id="sec-team">
        <div className="yat-placeholder">
          <div className="yat-placeholder-icon">🏟️</div>
          <div className="yat-placeholder-title">Current Team Roster</div>
          <div className="yat-placeholder-body">
            The current {schoolName} varsity roster will appear here once the season begins.
          </div>
        </div>
      </section>
    </SchoolShell>
  );
}
