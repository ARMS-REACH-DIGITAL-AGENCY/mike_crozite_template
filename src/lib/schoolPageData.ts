// src/lib/schoolPageData.ts
// Shared helper: fetch and prepare school data for microsite section pages.

import { headers } from "next/headers";
import { getSchoolByHsid, getSchoolByUrl } from "@/lib/db";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import { getCanonicalBaseUrl } from "@/lib/canonicalUrl";

const ROOT_DOMAIN = (process.env.ROOT_DOMAIN || "yatstats.com").toLowerCase();

export interface SchoolPageData {
  school: Record<string, unknown>;
  resolvedHsid: string;
  schoolName: string;
  location: string;
  crestUrl: string;
  canonicalBase: string;
  navBase: string;
  subdomain: string;
}

/**
 * Returns school page data from the request context.
 * Returns null if no school is found (caller should redirect).
 */
export async function getSchoolPageData(hsid: string): Promise<SchoolPageData | null> {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const hostSchool = (host ? await getSchoolByUrl(`https://${host}`) : null) as Record<string, unknown> | null;
  const school = hostSchool ?? ((await getSchoolByHsid(hsid)) as Record<string, unknown> | null);
  if (!school) return null;

  const resolvedHsid = String(school.hsid ?? hsid);
  const schoolNameRaw = String(school.hsname || "").toUpperCase();
  const schoolName = schoolNameRaw.includes("HIGH SCHOOL")
    ? schoolNameRaw
    : `${schoolNameRaw} HIGH SCHOOL`;
  const location = String(school.hslocation || "").toUpperCase();
  const crestUrl = getSchoolCrestUrl(resolvedHsid);
  const canonicalBase = getCanonicalBaseUrl(school, resolvedHsid);

  // navBase: "" for custom/subdomain access, "/{hsid}" for preview/path-based access
  const isCustomDomain = !!hostSchool;
  const navBase = isCustomDomain ? "" : `/${resolvedHsid}`;

  // Extract subdomain for GHL tagging
  const subdomainPart =
    host === ROOT_DOMAIN ? "" : host.slice(0, -(ROOT_DOMAIN.length + 1));
  const subdomain = subdomainPart.split(".")[0] || resolvedHsid || "unknown";

  return { school, resolvedHsid, schoolName, location, crestUrl, canonicalBase, navBase, subdomain };
}
