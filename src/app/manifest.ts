import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getSchoolByUrl } from "@/lib/db";
import { formatSchoolName } from "@/lib/playerUtils";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const headersList = await headers();
  const host = headersList.get("host") || "";

  let school: Record<string, unknown> | null = null;
  try {
    if (host) {
      school = (await getSchoolByUrl(`https://${host}`)) as Record<string, unknown> | null;
    }
  } catch {
    school = null;
  }

  const hsid = school?.hsid ? String(school.hsid) : null;

  const schoolName = school
    ? formatSchoolName(String(school.hsname || "YAT?STATS"))
    : "YAT?STATS";

  // Chrome on Android only installs icons reliably when the declared
  // dimensions actually match the image, and the image is same-origin.
  const icon = (size: number, purpose: 'any' | 'maskable') => hsid
    ? `/api/icon/school?hsid=${encodeURIComponent(hsid)}&size=${size}&purpose=${purpose}`
    : '/img/yatstats-logo-circle.png';

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
        src: icon(192, 'any'),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: icon(512, 'any'),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      ...(hsid ? [{
        src: icon(512, 'maskable'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable' as const,
      }] : []),
    ],
  };
}
