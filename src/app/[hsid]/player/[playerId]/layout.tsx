import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSchoolByHsid, getSchoolByUrl, getPlayerById } from "@/lib/db";
import { formatSchoolName } from "@/lib/playerUtils";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";

export default async function PlayerIdLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ hsid: string; playerid: string }>;
}) {
  const { hsid, playerid } = await params;
  const headersList = await headers();
  const host = headersList.get("host") || "";

  let school: Record<string, unknown> | null = null;
  school = (host ? await getSchoolByUrl(`https://${host}`) : null) as Record<string, unknown> | null;
  if (!school) school = (await getSchoolByHsid(hsid)) as Record<string, unknown> | null;
  if (!school) redirect("https://yatstats.com");

  const player = await getPlayerById(playerid);
  const playerName = player
    ? `${String(player.firstname || "").trim()} ${String(player.lastname || "").trim()}`.trim()
    : "";

  const resolvedHsid = String(school.hsid ?? hsid);
  const schoolName = formatSchoolName(String(school.hsname || ""));
  const location = String(school.hslocation || "").toUpperCase();
  const crestUrl = getSchoolCrestUrl(resolvedHsid);

  return (
    <>
      <div className="yat-hr" />
      <div className="yat-schoolrow" id="schoolRow">
        <div className="yat-schoolrow-id">
          <img src={crestUrl} alt={`${schoolName} crest`} className="yat-crest" id="school-crest" />
          <div className="yat-schooltext">
            <div className="...line1...">{location}</div>
            <div className="...line2...">{schoolName}</div>
            <div className="...line3...">{playerName}</div>
          </div>
        </div>
        <button id="btnFanFav" className="fav-btn-hero" aria-label="Favorite">
          <i className="ri-star-line" /> FAVORITE
        </button>
      </div>

      {children}
    </>
  );
}
