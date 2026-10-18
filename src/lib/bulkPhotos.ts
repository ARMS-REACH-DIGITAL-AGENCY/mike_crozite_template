// src/lib/bulkPhotos.ts
// Bulk photo upload (reviewers only): the rows of the spreadsheet matched to
// players on the site, before anything is posted.
//
// A row names its player by an id or by name and high school:
//   Player ID - our YAT number (YAT000072) or any id we keep for him in
//               player_source_map (Baseball Cube, MLB...), so whichever
//               number is on hand finds the same player.
//   Name      - first + last name at the high school given (name and/or
//               city); without a school, only a name that's unique on the
//               whole site. A nickname (Mike for Michael) matches on last
//               name and first initial at that school, flagged as close.
// "Also In Photo" names are matched the same way, at the main player's
// school first.
import 'server-only';
import { query } from './db';

export const BULK_TYPES = [
  { id: 'flip_card', label: 'Flip Card Front (HS Photo)' },
  { id: 'headshot', label: 'Headshot' },
  { id: 'back_hero', label: 'Flip Card Back (Action Current Team)' },
  { id: 'timeline_hero', label: 'Timeline (Season Photo)' },
  { id: 'story', label: 'Story / Memory' },
] as const;
export type BulkType = (typeof BULK_TYPES)[number]['id'];

export type BulkRow = {
  row: number;
  file: string;
  first: string;
  last: string;
  school: string;
  city: string;
  playerId: string;
  type: string;
  year: string;
  month: string;
  caption: string;
  alsoIn: string;
  credit: string;
};

export type BulkPlayer = { playerid: string; name: string; hsid: string; school: string; location: string; classOf: string; status: string };

export type BulkCheck = {
  row: number;
  type: BulkType | null;
  year: number | null;
  month: number | null;
  player: BulkPlayer | null;
  close: boolean;
  candidates: BulkPlayer[];
  tagged: BulkPlayer[];
  // Problems hold the row back; notes are worth a look but don't.
  problems: string[];
  notes: string[];
};

type Candidate = BulkPlayer & { first: string; last: string };

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
// A school name without the words every school has.
const schoolWords = (v: string) =>
  norm(v.toLowerCase().replace(/\b(high school|high|school|hs|h\.s\.|the|academy|prep)\b/g, ' '));

export function bulkType(value: string): BulkType | null {
  const v = norm(value);
  if (!v) return null;
  if (v.startsWith('flipcardfront') || v.startsWith('hsphoto') || v.startsWith('highschool')) return 'flip_card';
  if (v.startsWith('headshot')) return 'headshot';
  if (v.startsWith('flipcardback') || v.startsWith('action')) return 'back_hero';
  if (v.startsWith('timeline') || v.startsWith('season')) return 'timeline_hero';
  if (v.startsWith('story') || v.startsWith('memory')) return 'story';
  return null;
}

const STAGE_SQL = `
  SELECT DISTINCT ON (f.playerid::text)
         f.playerid::text AS playerid, COALESCE(f.first_name, '') AS first, COALESCE(f.last_name, '') AS last,
         TRIM(COALESCE(f.first_name, '') || ' ' || COALESCE(f.last_name, '')) AS name,
         COALESCE(f.hsid::text, '') AS hsid, COALESCE(s.hsname, '') AS school, COALESCE(s.hslocation, '') AS location,
         COALESCE(f.class_of::text, '') AS "classOf", COALESCE(f.status_label, '') AS status
    FROM flip_card_front_stage f
    LEFT JOIN LATERAL (SELECT hsname, hslocation FROM school_success WHERE hsid::text = f.hsid::text LIMIT 1) s ON true`;

// Every player any of these ids points to: his own playerid, or an id we
// keep for him from another source.
async function byIds(ids: string[]): Promise<Map<string, Candidate>> {
  const out = new Map<string, Candidate>();
  if (!ids.length) return out;
  const { rows } = await query<Candidate & { asked: string }>(
    `WITH asked AS (SELECT DISTINCT unnest($1::text[]) AS id),
          resolved AS (
            SELECT a.id AS asked, a.id AS playerid FROM asked a
             WHERE EXISTS (SELECT 1 FROM flip_card_front_stage f WHERE upper(f.playerid::text) = upper(a.id))
            UNION
            SELECT a.id, m.playerid FROM asked a JOIN player_source_map m ON m.source_player_id = a.id
             WHERE m.match_method IS DISTINCT FROM 'rejected_bad_identity_match'
               AND NOT EXISTS (SELECT 1 FROM flip_card_front_stage f WHERE upper(f.playerid::text) = upper(a.id))
          )
     SELECT r.asked, p.* FROM resolved r
       JOIN (${STAGE_SQL} ORDER BY f.playerid::text, f.updated_at DESC NULLS LAST) p ON upper(p.playerid) = upper(r.playerid)`,
    [ids]
  );
  for (const r of rows) if (!out.has(r.asked.toUpperCase())) out.set(r.asked.toUpperCase(), r);
  return out;
}

// Everyone with one of these last names (first names are compared here, so
// a nickname can still match on its initial).
async function byLastNames(lasts: string[]): Promise<Candidate[]> {
  if (!lasts.length) return [];
  const { rows } = await query<Candidate>(
    `${STAGE_SQL}
      WHERE regexp_replace(lower(f.last_name), '[^a-z0-9]', '', 'g') = ANY($1::text[])
      ORDER BY f.playerid::text, f.updated_at DESC NULLS LAST`,
    [lasts]
  );
  return rows;
}

function atSchool(c: Candidate, school: string, city: string) {
  const want = schoolWords(school);
  const have = schoolWords(c.school);
  const schoolOk = !want || (!!have && (have.includes(want) || want.includes(have)));
  const cityWant = norm(city.split(',')[0] || '');
  const cityOk = !cityWant || norm(c.location).includes(cityWant);
  return schoolOk && cityOk;
}

const strip = (c: Candidate): BulkPlayer => ({ playerid: c.playerid, name: c.name, hsid: c.hsid, school: c.school, location: c.location, classOf: c.classOf, status: c.status });

function pickByName(pool: Candidate[], first: string, last: string, school: string, city: string, preferHsid = '') {
  const f = norm(first);
  const l = norm(last);
  const sameLast = pool.filter((c) => norm(c.last) === l);
  const inSchool = (school || city)
    ? sameLast.filter((c) => atSchool(c, school, city))
    : preferHsid ? sameLast.filter((c) => c.hsid === preferHsid) : [];
  const exact = (list: Candidate[]) => list.filter((c) => norm(c.first) === f);
  const initial = (list: Candidate[]) => list.filter((c) => f && norm(c.first)[0] === f[0]);
  // At the school: exact first name, else the same first initial (a
  // nickname). Without a school (or no one there): a unique exact name.
  for (const [list, close] of [[exact(inSchool), false], [initial(inSchool), true]] as const) {
    if (list.length === 1) return { player: list[0], close, candidates: [] as Candidate[] };
    if (list.length > 1) return { player: null, close, candidates: list };
  }
  if (school || city) return { player: null, close: false, candidates: exact(sameLast) };
  const anywhere = exact(sameLast);
  if (anywhere.length === 1) return { player: anywhere[0], close: false, candidates: [] };
  return { player: null, close: false, candidates: anywhere };
}

export async function checkBulkRows(rows: BulkRow[]): Promise<BulkCheck[]> {
  const thisYear = new Date().getFullYear();
  const alsoIn = rows.map((r) => r.alsoIn.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean));
  const looksLikeId = (v: string) => /^(?:YAT)?\d+$/i.test(v.replace(/\s/g, ''));
  const ids = [
    ...rows.map((r) => r.playerId.trim()).filter(Boolean),
    ...alsoIn.flat().filter(looksLikeId).map((v) => v.replace(/\s/g, '')),
  ];
  const lastOf = (name: string) => name.trim().split(/\s+/).slice(1).join(' ');
  const lasts = [
    ...rows.map((r) => norm(r.last)),
    ...alsoIn.flat().filter((v) => !looksLikeId(v)).map((v) => norm(lastOf(v))),
  ].filter(Boolean);
  const [idMap, pool] = await Promise.all([byIds(Array.from(new Set(ids))), byLastNames(Array.from(new Set(lasts)))]);

  return rows.map((r, i) => {
    const problems: string[] = [];
    const notes: string[] = [];
    const type = bulkType(r.type);
    if (!r.file.trim()) problems.push('No file name.');
    if (!type) problems.push(r.type.trim() ? `Unknown photo type "${r.type}".` : 'No photo type.');
    const yearNum = Number(String(r.year).trim());
    const year = Number.isInteger(yearNum) && yearNum >= 1950 && yearNum <= thisYear + 1 ? yearNum : null;
    if (!year && type !== 'flip_card' && type !== 'back_hero') problems.push(String(r.year).trim() ? `"${r.year}" isn't a year.` : 'No year.');
    const monthText = String(r.month || '').trim();
    const monthNum = Number(monthText) || (monthText ? new Date(`${monthText} 1, 2000`).getMonth() + 1 : 0);
    const month = monthNum >= 1 && monthNum <= 12 ? monthNum : null;
    if (type === 'story' && !r.caption.trim()) problems.push('A Story / Memory needs a caption.');

    let player: Candidate | null = null;
    let close = false;
    let candidates: Candidate[] = [];
    if (r.playerId.trim()) {
      player = idMap.get(r.playerId.trim().toUpperCase()) || null;
      if (!player) problems.push(`No player with id ${r.playerId.trim()}.`);
    } else if (r.first.trim() || r.last.trim()) {
      const found = pickByName(pool, r.first, r.last, r.school, r.city);
      player = found.player;
      close = found.close;
      candidates = found.candidates;
      if (!player) {
        const who = `${r.first} ${r.last}`.trim();
        problems.push(
          candidates.length > 1
            ? `${candidates.length} players named ${who}${r.school ? ` at ${r.school}` : ''}: add the Player ID.`
            : `No ${who} found${r.school || r.city ? ` at ${[r.school, r.city].filter(Boolean).join(', ')}` : ''}.${r.school || r.city ? '' : ' Add his high school.'}`
        );
      }
    } else {
      problems.push('No player: add his name and high school, or his Player ID.');
    }

    const tagged: Candidate[] = [];
    for (const name of alsoIn[i]) {
      let hit: Candidate | null = null;
      if (looksLikeId(name)) hit = idMap.get(name.replace(/\s/g, '').toUpperCase()) || null;
      else {
        const [first, ...rest] = name.split(/\s+/);
        hit = pickByName(pool, first, rest.join(' '), '', '', player?.hsid || '').player;
      }
      if (hit && hit.playerid !== player?.playerid) tagged.push(hit);
      else if (!hit) problems.push(`Also In Photo: no single match for "${name}" (use his Player ID).`);
    }
    if (tagged.length && type !== 'story') notes.push('Also In Photo is only used on a Story / Memory; ignored.');
    if (player && close) notes.push(`Close match: ${r.first} ${r.last} → ${player.name}.`);
    if (player && !r.playerId.trim() && !r.school.trim() && !r.city.trim()) notes.push(`Matched by name only: ${player.name}, ${player.school || 'no school'}. Add his high school to be sure.`);

    return {
      row: r.row,
      type,
      year,
      month,
      player: player ? strip(player) : null,
      close,
      candidates: candidates.slice(0, 6).map(strip),
      tagged: tagged.map(strip),
      problems,
      notes,
    };
  });
}
