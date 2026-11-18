import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { query } from "@/lib/db";

// One card truth (Pete, Nov 18 2026). The gallery card front, the card back
// and the player profile all show flip_card_front_stage, but each keeps a copy
// (src/lib/cardDataTtl.ts). Changes made through the site clear the copies at
// once; changes made by jobs (MLB, roster sync, TBC imports) or by hand did
// not, so the three spots could disagree for up to an hour. Every minute this
// finds the cards changed since its bookmark and clears all their copies
// together: the school's copy and the player's profile copies (card id and
// YAT ID). After a large import it clears everything at once.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE = "flip_card_front_stage";
const MAX_TARGETED = 500; // more changed cards than this: clear all card data
const OVERLAP = "2 minutes"; // re-check a little behind the bookmark (in-flight writes)

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization") || "";
  return Boolean(expected && bearer === `Bearer ${expected}`);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows: state } = await query<{ last_at: string; now: string }>(
    `SELECT COALESCE((SELECT last_at FROM public.card_cache_sync_state WHERE name = $1), now() - interval '1 hour')::text AS last_at,
            now()::text AS now`,
    [STATE]
  );
  const since = state[0].last_at;
  const until = state[0].now;

  const { rows: changed } = await query<{ playerid: string; yatid: string | null; hsid: string | null }>(
    `SELECT playerid::text AS playerid, yatid, hsid::text AS hsid
       FROM public.flip_card_front_stage
      WHERE GREATEST(stage_updated_at, updated_at) > $1::timestamptz - interval '${OVERLAP}'
        AND GREATEST(stage_updated_at, updated_at) <= $2::timestamptz
      LIMIT ${MAX_TARGETED + 1}`,
    [since, until]
  );

  let cleared: string;
  if (changed.length > MAX_TARGETED) {
    revalidateTag("school-data", { expire: 0 });
    revalidateTag("player-profile", { expire: 0 });
    cleared = "all card data (large change)";
  } else {
    const tags = new Set<string>();
    for (const c of changed) {
      if (c.hsid) tags.add(`school-data:${c.hsid}`);
      tags.add(`player-profile:${c.playerid}`);
      if (c.yatid) tags.add(`player-profile:${c.yatid}`);
    }
    tags.forEach((tag) => revalidateTag(tag, { expire: 0 }));
    cleared = `${tags.size} copies`;
  }

  await query(
    `INSERT INTO public.card_cache_sync_state (name, last_at) VALUES ($1, $2::timestamptz)
     ON CONFLICT (name) DO UPDATE SET last_at = EXCLUDED.last_at`,
    [STATE, until]
  );
  return NextResponse.json({ since, until, changedCards: changed.length, cleared });
}
