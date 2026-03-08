// src/app/[hsid]/page.tsx
// YAT?STATS — School microsite: WHERE THEY YAT? (active alumni roster)

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  getSchoolByHsid,
  getActiveRosterByHsid,
  getSchoolByUrl,
} from "@/lib/db";
import SchoolShell from "@/components/SchoolShell";
import PlayerCard from "@/components/PlayerCard";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import { getCanonicalBaseUrl } from "@/lib/canonicalUrl";
import { gradClass } from "@/lib/playerUtils";

export const runtime = "nodejs";

const ROOT_DOMAIN = (process.env.ROOT_DOMAIN || "yatstats.com").toLowerCase();

export async function generateMetadata({ params }: { params: Promise<{ hsid: string }> }): Promise<Metadata> {
  const { hsid } = await params;
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const hostSchool = host ? await getSchoolByUrl(`https://${host}`) : null;
  // On preview domains (e.g. vercel.app) the host lookup returns null; fall back to hsid param.
  const school = hostSchool || await getSchoolByHsid(hsid);
  const name = (school as Record<string,unknown>)?.hsname as string || "Your School";
  const loc = (school as Record<string,unknown>)?.hslocation as string || "";
  // Extract state abbreviation from location (e.g., "Chandler, AZ" -> "AZ")
  const locParts = loc.split(",").map((s: string) => s.trim());
  const stateAbbr = locParts.length > 1 ? locParts[locParts.length - 1].toUpperCase() : "";
  const titleParts = [name.toUpperCase(), stateAbbr, "YAT?STATS - Where They YAT?"].filter(Boolean);
  const schoolHsid = (school as Record<string,unknown>)?.hsid as string || hsid;
  const crestUrl = getSchoolCrestUrl(schoolHsid);
  const canonicalUrl = getCanonicalBaseUrl(school as Record<string, unknown> | null, schoolHsid);
  return {
    title: titleParts.join(" | "),
    description: `Track active and all-time baseball alumni from ${name} (${loc}).`,
    alternates: {
      canonical: canonicalUrl,
    },
    icons: {
      icon: [
        { url: crestUrl, type: "image/png" },
        { url: "/favicon.ico", type: "image/x-icon" },
      ],
      apple: crestUrl,
    },
  };
}

export default async function SchoolPage({ params }: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await params;
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const hostSchool = (host ? await getSchoolByUrl(`https://${host}`) : null) as Record<string,unknown> | null;
  // On preview domains (e.g. vercel.app) the host lookup returns null; fall back to hsid param.
  const school = hostSchool ?? (await getSchoolByHsid(hsid) as Record<string,unknown> | null);
  if (!school) redirect("https://yatstats.com");

  const resolvedHsid = String(school.hsid ?? hsid);
  const activeRoster = await getActiveRosterByHsid(resolvedHsid);

  const schoolNameRaw = (String(school.hsname || "")).toUpperCase();
  const schoolName = schoolNameRaw.includes('HIGH SCHOOL') ? schoolNameRaw : `${schoolNameRaw} HIGH SCHOOL`;
  const location = (String(school.hslocation || "")).toUpperCase();
  const crestUrl = getSchoolCrestUrl(resolvedHsid);
  const canonicalBase = getCanonicalBaseUrl(school, resolvedHsid);
  const photoDefaultUrl = `${canonicalBase}/assets/img/now_players/default.jpg`;

  // navBase: "" for custom/subdomain access (middleware handles the rewrite),
  // "/{hsid}" for path-based preview access (e.g. vercel.app)
  const isCustomDomain = !!hostSchool;
  const navBase = isCustomDomain ? "" : `/${resolvedHsid}`;

  // Extract subdomain for GHL tagging
  const subdomainPart = host === ROOT_DOMAIN ? "" : host.slice(0, -(ROOT_DOMAIN.length + 1));
  const subdomain = subdomainPart.split(".")[0] || resolvedHsid || "unknown";

  const gradClasses = Array.from(new Set(
    (activeRoster as Record<string,unknown>[]).map((p) => gradClass(p)).filter(Boolean)
  )).sort().reverse();

  return (
    <SchoolShell
      schoolName={schoolName}
      location={location}
      crestUrl={crestUrl}
      resolvedHsid={resolvedHsid}
      subdomain={subdomain}
      navBase={navBase}
      sectionLabel="WHERE THEY YAT?"
      gradClasses={gradClasses}
    >
      <section className="yat-section visible" id="sec-active">
        <div className="yat-grid" id="active-grid">
          {(activeRoster as Record<string,unknown>[]).length === 0 ? (
            <div className="yat-empty">
              <div className="yat-empty-icon">⚾</div>
              <div className="yat-empty-title">No active players found</div>
              <div className="yat-empty-sub">Check back once the 2026 season begins</div>
            </div>
          ) : (activeRoster as Record<string,unknown>[]).map((p) => (
            <PlayerCard
              key={String(p.playerid)}
              p={p}
              resolvedHsid={resolvedHsid}
              photoDefaultUrl={photoDefaultUrl}
              variant="active"
            />
          ))}
        </div>
      </section>
    </SchoolShell>
  );
}
