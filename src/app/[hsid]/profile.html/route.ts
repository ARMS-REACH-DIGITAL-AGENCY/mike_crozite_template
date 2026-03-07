import { NextResponse, NextRequest } from "next/server";
import { notFound } from "next/navigation";
import { findPlayersBySlug } from "@/lib/db";
import { toPlayerSlug } from "@/lib/slug";

function slugify(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "player";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await params;
  const url = new URL(req.url);
  const playerParam = url.searchParams.get("player") || "";
  const lookupSlug = slugify(playerParam);
  if (!lookupSlug) return NextResponse.redirect(`/${hsid}`, 308);

  const matches = await findPlayersBySlug(lookupSlug, hsid);
  if (matches.length === 0) {
    notFound();
  }

  if (matches.length === 1) {
    const only = matches[0];
    const canonicalSlug = toPlayerSlug(only.firstname, only.lastname);
    return NextResponse.redirect(`/${hsid}/player/${only.playerid}/${canonicalSlug}`, 308);
  }

  const sameSchool = matches.filter((m) => m.hsid === hsid);
  if (sameSchool.length === 1) {
    const pick = sameSchool[0];
    const canonicalSlug = toPlayerSlug(pick.firstname, pick.lastname);
    return NextResponse.redirect(`/${hsid}/player/${pick.playerid}/${canonicalSlug}`, 308);
  }

  const options = matches
    .map(
      (m) =>
        `<li><a href="/${hsid}/player/${m.playerid}/${toPlayerSlug(m.firstname, m.lastname)}">${m.firstname} ${m.lastname}</a></li>`
    )
    .join("");

  return new NextResponse(
    `<html><body style="font-family:sans-serif;padding:20px;color:#111"><h1>Select player</h1><ul>${options}</ul></body></html>`,
    { status: 300, headers: { "content-type": "text/html" } }
  );
}
