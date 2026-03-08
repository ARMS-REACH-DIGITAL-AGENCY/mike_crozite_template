// src/app/[hsid]/faqs/page.tsx
// YAT?STATS — School microsite: FAQ'S section

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
  if (!data) return { title: "FAQ's | YAT?STATS" };
  const { schoolName, canonicalBase } = data;
  return {
    title: `FAQ'S | ${schoolName} | YAT?STATS`,
    description: `Frequently asked questions about YAT?STATS and ${schoolName}.`,
    alternates: { canonical: `${canonicalBase}/faqs` },
  };
}

export default async function FaqsPage({
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
      sectionLabel="FAQ'S"
    >
      <section className="yat-section visible" id="sec-faq">
        <div className="yat-placeholder">
          <div className="yat-placeholder-icon">❓</div>
          <div className="yat-placeholder-title">FAQ&apos;s</div>
          <div className="yat-placeholder-body">
            Frequently asked questions about YAT?STATS, how data is sourced, and how to get your school listed. Coming soon.
          </div>
        </div>
      </section>
    </SchoolShell>
  );
}
