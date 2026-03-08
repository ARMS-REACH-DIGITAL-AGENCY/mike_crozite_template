// src/app/[hsid]/pcd-action-partner-program/page.tsx
// YAT?STATS — School microsite: PCD ACTION PARTNER PROGRAM section

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
  if (!data) return { title: "PCD Action Partner Program | YAT?STATS" };
  const { schoolName, canonicalBase } = data;
  return {
    title: `PCD ACTION PARTNER PROGRAM | ${schoolName} | YAT?STATS`,
    description: `Sponsorship and partnership opportunities through the YAT?STATS network for ${schoolName}.`,
    alternates: { canonical: `${canonicalBase}/pcd-action-partner-program` },
  };
}

export default async function PcdActionPartnerProgramPage({
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
      sectionLabel="PCD ACTION PARTNER PROGRAM"
    >
      <section className="yat-section visible" id="sec-partner">
        <div className="yat-placeholder">
          <div className="yat-placeholder-icon">🤝</div>
          <div className="yat-placeholder-title">PCD Action Partner Program</div>
          <div className="yat-placeholder-body">
            Sponsorship and partnership opportunities for brands wanting to connect with the YAT?STATS network.
            <br /><br />
            <a
              href="mailto:sponsor@yatstats.com"
              style={{display:"inline-block",background:"#00e676",color:"#000",fontFamily:'"Bebas Neue",Oswald,sans-serif',fontSize:"14px",letterSpacing:".1em",padding:"10px 24px",borderRadius:"4px"}}
            >
              Get In Touch
            </a>
          </div>
        </div>
      </section>
    </SchoolShell>
  );
}
