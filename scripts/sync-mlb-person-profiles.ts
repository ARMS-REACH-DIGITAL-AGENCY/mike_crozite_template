// scripts/sync-mlb-person-profiles.ts
// Keeps public.mlb_person_profile current: MLB's /people record (bio, debut,
// last game, high school) for every verified player_source_map mlb_api link.
// Read once here, so cards, profiles and school counts never call MLB.
//
// MLB debut rule (Pete, Nov 2026): a school's MLB alumni count is a stored
// number, not computed on page load. When a player's MLB debut date appears
// for the first time, every one of his high schools gets +1 on
// school_success.mlb. Each debut is logged in mlb_debut_events, so a rerun
// never counts the same player twice.
//
// Usage:
//   npx tsx scripts/sync-mlb-person-profiles.ts            # all links
//   npx tsx scripts/sync-mlb-person-profiles.ts --dry-run  # fetch + report only
//
// Env: DATABASE_URL.

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const DRY_RUN = process.argv.includes("--dry-run");
const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";
const BATCH = 100;
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

type Profile = Record<string, unknown> & { mlb_id: string; playerid: string; mlb_debut_date: string | null };

async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.mlb_person_profile (
      mlb_id text PRIMARY KEY, playerid text NOT NULL,
      full_name text, first_name text, middle_name text, last_name text, use_name text, nick_name text,
      birth_date date, birth_city text, birth_state text, birth_country text,
      height text, weight integer, bats text, throws text, primary_position text,
      mlb_debut_date date, last_played_date date, draft_year integer, mlb_active boolean,
      high_schools jsonb, colleges jsonb, fetched_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_mlb_person_profile_playerid ON public.mlb_person_profile (playerid)`);
  // One row per (debut, high school): a school with no school_success row
  // yet is left pending and counted on a later run, once its row exists.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.mlb_debut_events (
      mlb_id text NOT NULL, hsid text NOT NULL, playerid text NOT NULL,
      mlb_debut_date date NOT NULL, counted boolean NOT NULL DEFAULT false,
      applied_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (mlb_id, hsid))`);
}

async function fetchPeople(ids: string[]): Promise<any[]> {
  const url = `${MLB_API_BASE}/people?personIds=${ids.join(",")}&hydrate=education`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { people?: any[] };
      return data.people ?? [];
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return [];
}

function toProfile(p: any, playerid: string): Profile {
  const ed = p.education ?? {};
  return {
    mlb_id: String(p.id), playerid,
    full_name: p.fullName ?? null, first_name: p.firstName ?? null, middle_name: p.middleName ?? null,
    last_name: p.lastName ?? null, use_name: p.useName ?? null, nick_name: p.nickName ?? null,
    birth_date: p.birthDate ?? null, birth_city: p.birthCity ?? null, birth_state: p.birthStateProvince ?? null,
    birth_country: p.birthCountry ?? null, height: p.height ?? null, weight: p.weight ?? null,
    bats: p.batSide?.code ?? null, throws: p.pitchHand?.code ?? null,
    primary_position: p.primaryPosition?.abbreviation ?? null,
    mlb_debut_date: p.mlbDebutDate ?? null, last_played_date: p.lastPlayedDate ?? null,
    draft_year: p.draftYear ?? null, mlb_active: p.active ?? null,
    high_schools: ed.highschools ?? null, colleges: ed.colleges ?? null,
  };
}

const UPSERT = `
  WITH x AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      mlb_id text, playerid text, full_name text, first_name text, middle_name text, last_name text,
      use_name text, nick_name text, birth_date date, birth_city text, birth_state text, birth_country text,
      height text, weight integer, bats text, throws text, primary_position text, mlb_debut_date date,
      last_played_date date, draft_year integer, mlb_active boolean, high_schools jsonb, colleges jsonb))
  INSERT INTO public.mlb_person_profile
  SELECT x.*, now() FROM x
  ON CONFLICT (mlb_id) DO UPDATE SET
    playerid = EXCLUDED.playerid, full_name = EXCLUDED.full_name, first_name = EXCLUDED.first_name,
    middle_name = EXCLUDED.middle_name, last_name = EXCLUDED.last_name, use_name = EXCLUDED.use_name,
    nick_name = EXCLUDED.nick_name, birth_date = EXCLUDED.birth_date, birth_city = EXCLUDED.birth_city,
    birth_state = EXCLUDED.birth_state, birth_country = EXCLUDED.birth_country, height = EXCLUDED.height,
    weight = EXCLUDED.weight, bats = EXCLUDED.bats, throws = EXCLUDED.throws,
    primary_position = EXCLUDED.primary_position, mlb_debut_date = EXCLUDED.mlb_debut_date,
    last_played_date = EXCLUDED.last_played_date, draft_year = EXCLUDED.draft_year,
    mlb_active = EXCLUDED.mlb_active, high_schools = EXCLUDED.high_schools, colleges = EXCLUDED.colleges,
    fetched_at = now()`;

// New debuts, per (player, high school) that has a school_success row and
// no logged event yet. Only a debut in the last 30 days adds +1; an older
// debut (e.g. a 1995 major leaguer linked today) is logged without a bump,
// because school_success.mlb already counts him. A school without a
// school_success row is not logged, so it is counted once its row exists.
const APPLY_DEBUTS = `
  WITH pending AS (
    SELECT DISTINCT p.mlb_id, ph.hsid::text AS hsid, p.playerid, p.mlb_debut_date,
           p.mlb_debut_date >= CURRENT_DATE - 30 AS counted
      FROM public.mlb_person_profile p
      JOIN public.player_hsids ph ON ph.playerid::text = p.playerid
     WHERE p.mlb_debut_date IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.school_success s WHERE s.hsid::text = ph.hsid::text)
       AND NOT EXISTS (SELECT 1 FROM public.mlb_debut_events e
                        WHERE e.mlb_id = p.mlb_id AND e.hsid = ph.hsid::text)
  ),
  logged AS (
    INSERT INTO public.mlb_debut_events (mlb_id, hsid, playerid, mlb_debut_date, counted)
    SELECT mlb_id, hsid, playerid, mlb_debut_date, counted FROM pending
    ON CONFLICT (mlb_id, hsid) DO NOTHING
    RETURNING hsid, counted
  ),
  bumps AS (
    SELECT hsid, COUNT(*)::int AS n FROM logged WHERE counted GROUP BY hsid
  ),
  updated AS (
    UPDATE public.school_success s SET mlb = COALESCE(NULLIF(s.mlb::text, '')::int, 0) + b.n
      FROM bumps b WHERE s.hsid::text = b.hsid
    RETURNING s.hsid
  )
  SELECT (SELECT COUNT(*) FROM logged WHERE counted)::int AS debuts,
         (SELECT COUNT(*) FROM logged WHERE NOT counted)::int AS logged_only,
         (SELECT COUNT(*) FROM updated)::int AS schools`;

async function main() {
  console.log(`=== MLB person profiles (${DRY_RUN ? "DRY RUN" : "LIVE"}) ===`);
  if (!DRY_RUN) await ensureTables();
  const { rows: links } = await pool.query<{ mlb_id: string; playerid: string }>(`
    SELECT source_player_id::text AS mlb_id, playerid::text AS playerid
      FROM public.player_source_map
     WHERE source = 'mlb_api' AND match_method IS DISTINCT FROM 'rejected_bad_identity_match'`);
  const pidOf = new Map(links.map((l) => [l.mlb_id, l.playerid]));
  const ids = [...pidOf.keys()];
  console.log(`Linked MLB IDs: ${ids.length}`);

  let saved = 0;
  let missing = 0;
  let pending: Profile[] = [];
  const flush = async () => {
    if (pending.length === 0) return;
    if (!DRY_RUN) await pool.query(UPSERT, [JSON.stringify(pending)]);
    saved += pending.length;
    pending = [];
  };
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const people = await fetchPeople(batch);
    missing += batch.length - people.length;
    for (const p of people) pending.push(toProfile(p, pidOf.get(String(p.id))!));
    if (pending.length >= 1000) await flush();
    await new Promise((r) => setTimeout(r, 200));
  }
  await flush();
  console.log(`Profiles ${DRY_RUN ? "fetched" : "saved"}: ${saved}; MLB returned no record for ${missing}`);

  if (DRY_RUN) {
    console.log("Dry run: no debut counts applied.");
  } else {
    const { rows } = await pool.query<{ debuts: number; logged_only: number; schools: number }>(APPLY_DEBUTS);
    console.log(`New MLB debuts (last 30 days, counted): ${rows[0].debuts}; schools +1: ${rows[0].schools}; older debuts logged only: ${rows[0].logged_only}`);
  }
  await pool.end();
}

main().catch(async (err) => {
  console.error("sync-mlb-person-profiles failed:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
