// src/app/[hsid]/mentorship-marketplace/page.tsx
// YAT?STATS — School microsite: MENTORSHIP MARKETPLACE section

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
  if (!data) return { title: "Mentorship Marketplace | YAT?STATS" };
  const { schoolName, canonicalBase } = data;
  return {
    title: `MENTORSHIP MARKETPLACE | ${schoolName} | YAT?STATS`,
    description: `Connect with ${schoolName} alumni for mentorship and career development.`,
    alternates: { canonical: `${canonicalBase}/mentorship-marketplace` },
  };
}

export default async function MentorshipMarketplacePage({
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
      sectionLabel="MENTORSHIP MARKETPLACE"
    >
      <section className="yat-section visible" id="sec-mentor">
        <div className="yat-placeholder">
          <div className="yat-placeholder-icon">🤝</div>
          <div className="yat-placeholder-title">Mentorship Marketplace</div>
          <div className="yat-placeholder-body">
            Connect with {schoolName} alumni for mentorship, NIL guidance, and career development. Coming soon.
          </div>
        </div>
      </section>
    </SchoolShell>
  );
}
