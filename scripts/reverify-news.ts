#!/usr/bin/env ts-node
// Re-evaluate stored Alumni News candidates against current YAT?STATS identity data.
// Default: REVIEW rows only. Use --all to re-check every stored article.

import { Pool } from "pg";
import { verifyNewsIdentity } from "./lib/newsIdentity";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const args = process.argv.slice(2);
const all = args.includes("--all");
const hsidIdx = args.indexOf("--hsid");
const hsid = hsidIdx >= 0 ? args[hsidIdx + 1] : (process.env.NEWS_HSIDS || "5004").split(",")[0];

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const { rows } = await pool.query(
    `SELECT
       na.id, na.uuid, na.playerid, na.player_name, na.hsid,
       na.title, na.snippet, na.summary, na.source_full, na.source,
       COALESCE(f.first_name, ctx.firstname) AS firstname,
       COALESCE(f.last_name, ctx.lastname) AS lastname,
       COALESCE(ctx.high_school, tp.high_school) AS high_school,
       f.class_of::text AS class_of,
       COALESCE(NULLIF(TRIM(f.position), ''), tp.posit) AS position,
       f.current_team_name AS current_team,
       f.current_org_or_conference_name AS current_org,
       f.level_label AS current_level,
       ctx.college_path_text AS college_path,
       ctx.career_team_names AS career_teams
     FROM news_articles na
     JOIN flip_card_front_stage f ON f.playerid::text = na.playerid
     LEFT JOIN v_news_player_context ctx ON ctx.playerid::text = na.playerid
     LEFT JOIN tbc_players_raw tp ON tp.playerid::text = na.playerid
     WHERE na.hsid = $1
       AND ($2::boolean OR na.verification_status IN ('REVIEW','PENDING'))
     ORDER BY na.published_at DESC`,
    [hsid, all]
  );

  let verified = 0;
  let review = 0;
  let rejected = 0;

  for (const row of rows) {
    const result = verifyNewsIdentity(
      {
        title: row.title,
        text: row.snippet,
        summary: row.summary,
        source: row.source_full || row.source,
      },
      {
        playerid: String(row.playerid),
        firstname: String(row.firstname || "").trim(),
        lastname: String(row.lastname || "").trim(),
        hsid: String(row.hsid || ""),
        highSchool: row.high_school,
        classOf: row.class_of,
        position: row.position,
        currentTeam: row.current_team,
        currentOrg: row.current_org,
        currentLevel: row.current_level,
        collegePath: [row.college_path, row.career_teams].filter(Boolean).join("; "),
      }
    );

    if (result.status === "VERIFIED") verified++;
    else if (result.status === "REVIEW") review++;
    else rejected++;

    await pool.query(
      `UPDATE news_articles
       SET verification_status=$2,
           verification_score=$3,
           verification_reason=$4,
           verification_evidence=$5::jsonb,
           newsworthiness=$6,
           image_verification_status=
             CASE WHEN image_verification_status='SOURCE_VERIFIED'
                  THEN image_verification_status ELSE 'FALLBACK_PLAYER' END,
           display_image_url=COALESCE(
             display_image_url,
             'https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now/' || playerid || '.jpg'
           ),
           verified_at=CASE WHEN $2='VERIFIED' THEN NOW() ELSE NULL END
       WHERE id=$1`,
      [
        row.id,
        result.status,
        result.score,
        result.reason,
        JSON.stringify(result.evidence),
        result.newsworthiness,
      ]
    );
  }

  console.log(
    JSON.stringify(
      { hsid, checked: rows.length, verified, review, rejected, mode: all ? "all" : "review-only" },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
