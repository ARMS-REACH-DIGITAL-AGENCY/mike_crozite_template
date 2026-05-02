import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getSchoolByUrl } from "@/lib/db";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import { formatSchoolName } from "@/lib/playerUtils";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const headersList = await headers();
  const host = headersList.get("host") || "";

  let school: Record<string, unknown> | null = null;
  try {
    if (host) {
      school = await getSchoolByUrl(`https://${host}`) as Record<string, unknown> | null;
    }
  } catch {
    school = null;
  }

  const hsid = school?.hsid ? String(school.hsid) : null;
  const schoolName = school
    ? formatSchoolName(String(school.hsname || "YAT?STATS"))
    : "YAT?STATS";

  const iconUrl = hsid
    ? getSchoolCrestUrl(hsid)
    : "/img/yatstats-logo-circle.png";

  return {
    name: `${schoolName} | YAT?STATS`,
    short_name: schoolName.slice(0, 12),
    description: `${schoolName} active baseball alumni on YAT?STATS`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: iconUrl,
        sizes: "192x192",
        type: "image/png",
        purpose: ["any", "maskable"],
      },
      {
        src: iconUrl,
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}
