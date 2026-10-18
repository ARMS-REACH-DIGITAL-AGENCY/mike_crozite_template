// scripts/post-team-card-memories.ts
// Posts each state-champion team card (src/lib/teamCards.ts) as a YAT?STATS
// memory on the head coach's Career Path Timeline, in the card's season - a
// story like the Draft Day ones: live, public, posted by YAT?STATS, open to
// comments and shares. The timeline uses the card as that year's slide
// photo too.
//
// Safe to re-run: a season the coach already has a team card for is
// skipped. The coach is found by school and name, and must be exactly one
// card at that school with COACH in its status.
//
//   DATABASE_URL=... npx tsx scripts/post-team-card-memories.ts [--dry-run]

import { Pool } from "pg";
import { TEAM_CARD_YEARS, teamCardKeys } from "../src/lib/teamCards";

const DATABASE_URL = process.env.DATABASE_URL;
const DRY_RUN = process.argv.includes("--dry-run");
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

// The coach whose timeline carries each school's cards, and the team's name.
const COACHES: Record<string, { name: string; team: string }> = {
  "5004": { name: "MIKE WOODS", team: "Hamilton Huskies" },
};
const STAGE = "High School";

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();
  try {
    for (const [hsid, years] of Object.entries(TEAM_CARD_YEARS)) {
      const coachName = COACHES[hsid]?.name;
      const team = COACHES[hsid]?.team || "";
      if (!coachName) { console.log(`${hsid}: no coach set, skipped`); continue; }
      const coach = await client.query<{ playerid: string; display_name: string }>(
        `SELECT DISTINCT f.playerid::text AS playerid, f.display_name
           FROM flip_card_front_stage f
          WHERE f.hsid::text = $1 AND UPPER(TRIM(f.display_name)) = $2 AND UPPER(COALESCE(f.status_label, '')) LIKE '%COACH%'`,
        [hsid, coachName]
      );
      if (coach.rowCount !== 1) throw new Error(`${hsid}: expected one coach card for ${coachName}, found ${coach.rowCount}`);
      const { playerid, display_name: name } = coach.rows[0];
      const coachTitle = name.split(/\s+/).map((w) => w[0] + w.slice(1).toLowerCase()).join(" ");

      await client.query("BEGIN");
      let added = 0;
      for (const year of years) {
        const keys = teamCardKeys(hsid, year);
        const caption = `${team ? `${team}: ` : ""}${year} State Champions, Coach ${coachTitle}. Were you on this team? Where they YAT now?`;
        const have = await client.query<{ id: string; caption: string | null }>(
          `SELECT m.id::text AS id, m.caption FROM player_moment_submissions m JOIN player_moment_photos p ON p.moment_id = m.id
            WHERE m.playerid::text = $1 AND p.s3_key = $2 LIMIT 1`,
          [playerid, keys.full]
        );
        if (have.rowCount) {
          // Already posted: only the wording can change.
          if (have.rows[0].caption !== caption) {
            if (!DRY_RUN) await client.query(`UPDATE player_moment_submissions SET caption = $2 WHERE id = $1`, [have.rows[0].id, caption]);
            console.log(`${hsid} ${year}: ${DRY_RUN ? 'would reword' : 'reworded'} to "${caption}"`);
          } else {
            console.log(`${hsid} ${year}: already posted`);
          }
          continue;
        }
        if (DRY_RUN) { console.log(`${hsid} ${year}: would post "${caption}"`); continue; }
        await client.query(
          `WITH story AS (
             INSERT INTO player_moment_submissions (
               playerid, hsid, stage, caption, contributor_name, status, player_name,
               photo_taken_date, photo_taken_year, sort_date, visibility, is_private, arms_sync_status
             ) VALUES ($1, $2, $3, $4, 'YAT?STATS', 'live', $5, make_date($6, 5, 15), $6, make_date($6, 5, 15), 'public', false, 'system')
             RETURNING id
           ), players AS (
             INSERT INTO player_moment_players (moment_id, playerid, is_primary) SELECT id, $1, true FROM story
           )
           INSERT INTO player_moment_photos (moment_id, sort_order, s3_key, web_s3_key, thumb_s3_key, mime_type)
           SELECT id, 0, $7, $8, $9, 'image/jpeg' FROM story`,
          [playerid, hsid, STAGE, caption, name, year, keys.full, keys.web, keys.thumb]
        );
        added++;
        console.log(`${hsid} ${year}: posted`);
      }
      await client.query("COMMIT");
      console.log(`${hsid}: ${added} team card memories posted on ${name}'s timeline (${playerid})`);
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
