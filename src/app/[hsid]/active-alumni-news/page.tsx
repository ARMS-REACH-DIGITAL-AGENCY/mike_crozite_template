// src/app/[hsid]/active-alumni-news/page.tsx
// YAT?STATS — School microsite: ACTIVE ALUMNI NEWS section

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
  if (!data) return { title: "Active Alumni News | YAT?STATS" };
  const { schoolName, canonicalBase } = data;
  return {
    title: `ACTIVE ALUMNI NEWS | ${schoolName} | YAT?STATS`,
    description: `Active alumni news for ${schoolName}.`,
    alternates: { canonical: `${canonicalBase}/active-alumni-news` },
  };
}

export default async function ActiveAlumniNewsPage({
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
      sectionLabel="ACTIVE ALUMNI NEWS"
    >
      <section className="yat-section visible" id="sec-news">
        <div className="yat-placeholder">
          <div className="yat-placeholder-icon">📰</div>
          <div className="yat-placeholder-title">Alumni News Coming Soon</div>
          <div className="yat-placeholder-body">
            Integrating with <strong style={{color:"var(--fg)"}}>Webz.io</strong> to automatically surface news for every active alumni.
          </div>
        </div>
      </section>
    </SchoolShell>
  );
}
