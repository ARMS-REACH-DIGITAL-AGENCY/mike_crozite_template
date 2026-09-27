#!/usr/bin/env tsx
// scripts/generate-news-derivatives.ts
// Builds the publishable, player-centered YAT?STATS news layer from already
// ingested + identity-verified source articles.
//
// This intentionally does NOT discover news and does NOT call Webz.io.
// It only turns verified source rows into the UI payloads used by:
//   - Alumni News cards
//   - flip-card News teasers
//   - player-profile News feed + reader drawer
//
// The generator is precision-first:
//   * only VERIFIED, non-LOW stories are eligible
//   * source text is centered around the matched player
//   * the generated recap always names the player, so the profile's
//     player-centric display guard remains effective
//   * existing derivatives are preserved (manual/editorial work wins)

import { appendFileSync } from "fs";
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const args = process.argv.slice(2);
const hsidIdx = args.indexOf("--hsid");
const hsidArg = hsidIdx !== -1 ? args[hsidIdx + 1] : "";
const targetHsids = (hsidArg || process.env.NEWS_HSIDS || "5004")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const limitIdx = args.indexOf("--limit");
const limitArg = limitIdx !== -1 ? Number(args[limitIdx + 1]) : 0;
const batchLimit = Number.isFinite(limitArg) && limitArg > 0 ? Math.floor(limitArg) : 0;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

type CandidateRow = {
  uuid: string;
  playerid: string;
  player_name: string | null;
  player_firstname: string | null;
  player_lastname: string | null;
  hsid: string;
  title: string;
  source: string;
  source_full: string | null;
  published_at: string | Date;
  url: string;
  image_url: string | null;
  display_image_url: string | null;
  snippet: string | null;
  summary: string | null;
  raw_payload: any;
  verification_score: string | number | null;
  verification_evidence: any;
  newsworthiness: string | null;
  class_of: string | null;
  level_label: string | null;
  status_label: string | null;
  current_team_name: string | null;
  current_org_or_conference_name: string | null;
  stage_class_of: string | null;
  stage_level_label: string | null;
  stage_status_label: string | null;
  stage_team_name: string | null;
  stage_org_name: string | null;
  current_teamid: string | null;
};

function cleanText(value: unknown): string {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\bAdvertisement\b/gi, " ")
    .replace(/\bNow Playing\b/gi, " ")
    .replace(/\bPaused Ad Playing\b/gi, " ")
    .replace(/pic\.twitter\.com\/\S+/gi, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceList(value: string): string[] {
  if (!value) return [];
  return value
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 18);
}

function trimTo(value: string, max: number): string {
  const text = value.trim();
  if (text.length <= max) return text;
  const clipped = text.slice(0, max + 1);
  const boundary = Math.max(
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("; "),
    clipped.lastIndexOf(", "),
    clipped.lastIndexOf(" ")
  );
  return (boundary > max * 0.6 ? clipped.slice(0, boundary) : clipped.slice(0, max)).trimEnd() + "…";
}

function sourceDomain(row: CandidateRow): string {
  const raw = String(row.source_full || row.source || "").trim();
  try {
    if (/^https?:\/\//i.test(raw)) return new URL(raw).hostname.replace(/^www\./, "");
    if (raw.includes(".")) return raw.replace(/^www\./, "");
    return new URL(row.url).hostname.replace(/^www\./, "");
  } catch {
    return raw || "source";
  }
}

function sourceText(row: CandidateRow): string {
  const raw = row.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : {};
  return cleanText(
    row.summary ||
      raw.summary ||
      raw.highlightText ||
      row.snippet ||
      raw.text ||
      ""
  );
}

function selectPlayerContext(row: CandidateRow, fullName: string, lastName: string): string {
  const text = sourceText(row);
  if (!text) return "";

  const sentences = sentenceList(text);
  const full = fullName.toLowerCase();
  const last = lastName.toLowerCase();

  let indexes = sentences
    .map((sentence, index) => ({ index, sentence: sentence.toLowerCase() }))
    .filter(({ sentence }) => full && sentence.includes(full))
    .map(({ index }) => index);

  if (indexes.length === 0 && last.length >= 4) {
    indexes = sentences
      .map((sentence, index) => ({ index, sentence: sentence.toLowerCase() }))
      .filter(({ sentence }) => sentence.includes(last))
      .map(({ index }) => index);
  }

  const selected: string[] = [];
  const seen = new Set<number>();

  for (const index of indexes.slice(0, 3)) {
    for (const candidateIndex of [index, index + 1]) {
      if (
        candidateIndex >= 0 &&
        candidateIndex < sentences.length &&
        !seen.has(candidateIndex)
      ) {
        selected.push(sentences[candidateIndex]);
        seen.add(candidateIndex);
      }
      if (selected.join(" ").length >= 760) break;
    }
    if (selected.join(" ").length >= 760) break;
  }

  if (selected.length > 0) return trimTo(selected.join(" "), 760);

  // A headline can be the verified identity anchor even when the provider's
  // highlight body is sparse. Keep the fallback short rather than dumping a
  // generic article body into a player's recap.
  return trimTo(sentences.slice(0, 2).join(" ") || text, 320);
}

function buildDerivative(row: CandidateRow) {
  const firstName = String(row.player_firstname || "").trim();
  const lastName = String(row.player_lastname || "").trim();
  const fullName =
    String(row.player_name || "").trim() ||
    [firstName, lastName].filter(Boolean).join(" ") ||
    row.playerid;

  const effectiveLastName =
    lastName || fullName.split(/\s+/).filter(Boolean).slice(-1)[0] || "";
  const classOf = String(row.stage_class_of || row.class_of || "").trim();
  const level = String(row.stage_level_label || row.level_label || "").trim().toUpperCase();
  const status = String(row.stage_status_label || row.status_label || "").trim().toUpperCase();
  const team = String(row.stage_team_name || row.current_team_name || "").trim();
  const org = String(row.stage_org_name || row.current_org_or_conference_name || "").trim();

  const evidence = row.verification_evidence || {};
  const score = Number(row.verification_score || 0);
  const nameInHeadline = Boolean(evidence.nameInHeadline);
  const nameMentions = Number(evidence.nameMentions || 0);
  const playerRelevance =
    nameInHeadline ? "primary" : nameMentions >= 2 ? "secondary" : "mention";
  const storyScope =
    playerRelevance === "primary" ? "player_feature" : "player_update";
  const storyGrade =
    playerRelevance === "primary" && score >= 0.9
      ? "A"
      : playerRelevance === "secondary"
        ? "B"
        : "C";

  const domain = sourceDomain(row);
  const context = selectPlayerContext(row, fullName, effectiveLastName);
  const classLabel = classOf ? ` (Class of ${classOf})` : "";

  const lead =
    playerRelevance === "primary"
      ? `${fullName}${classLabel} is the focus of a new ${domain} report.`
      : playerRelevance === "secondary"
        ? `${fullName}${classLabel} is part of a new ${domain} baseball update.`
        : `${fullName}${classLabel} is mentioned in a broader ${domain} baseball report; the source story is not primarily about him.`;

  const recap = trimTo([lead, context].filter(Boolean).join(" "), 520);
  const profileBody = trimTo(
    [
      recap,
      team
        ? `YAT?STATS currently tracks ${fullName} with ${team}${org ? ` in ${org}` : ""}.`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
    900
  );

  const publishedDate = new Date(row.published_at).toISOString().slice(0, 10);
  const metaPills = [level, status, classOf ? `Class of ${classOf}` : ""].filter(Boolean);
  const contextLine = [team, org].filter(Boolean).join(" · ");
  const sourceLabel = domain.toUpperCase();

  return {
    fullName,
    storyScope,
    playerRelevance,
    storyGrade,
    score,
    recap,
    profileBody,
    publishedDate,
    domain,
    tease: {
      headline: row.title,
      badge: level ? `${level} UPDATE` : "ALUMNI UPDATE",
      body: trimTo(recap, 300),
      footer: `${domain} · ${publishedDate}`,
      primary_cta: {
        label: "READ FULL NEWS ON PROFILE",
        action: "open_player_profile_news_tab",
      },
    },
    galleryFront: {
      headline: row.title,
      player_name: fullName,
      context_line: contextLine,
      meta_pills: metaPills,
      published_at: publishedDate,
      source_label: sourceLabel,
      cta: "FLIP TO READ MORE",
    },
    galleryBack: {
      yati_recap: recap,
      why_local: classOf
        ? `Why this matters locally: ${fullName} is a Hamilton alum from the Class of ${classOf}.`
        : `Why this matters locally: ${fullName} is part of this school's baseball alumni community.`,
      primary_cta: {
        label: "VIEW PLAYER PROFILE",
        action: "open_player_profile_news_tab",
      },
      secondary_cta: {
        label: "SHARE THIS CARD",
        action: "native_share",
      },
      source_link: {
        label: "Read original source",
        url: row.url,
        target: "_blank",
        rel: "noopener noreferrer",
      },
    },
    profile: {
      title: row.title,
      body: profileBody,
      meta_subline: [fullName, level, team || org].filter(Boolean).join(" · "),
      why_local_heading: "Why this matters locally",
      why_local_body: classOf
        ? `${fullName} is a Hamilton alum from the Class of ${classOf}, so this update becomes another stop on his post-graduation baseball journey.`
        : `${fullName} is part of this school's baseball alumni community, so this update belongs on his continuing career timeline.`,
      source_link: {
        label: "READ ORIGINAL ARTICLE ↗",
        url: row.url,
        target: "_blank",
        rel: "noopener noreferrer",
      },
      share: {
        label: "SHARE WITH #YATABOY",
        prefill: `${fullName} news via YAT?STATS`,
      },
    },
    share: {
      share_text: `${fullName} news via YAT?STATS`,
      hashtags: ["YATABOY"],
    },
  };
}

async function loadCandidates(): Promise<CandidateRow[]> {
  const limitClause = batchLimit > 0 ? "LIMIT $2" : "";
  const params = batchLimit > 0 ? [targetHsids, batchLimit] : [targetHsids];

  const { rows } = await pool.query<CandidateRow>(
    `SELECT
       na.*,
       f.class_of AS stage_class_of,
       f.level_label AS stage_level_label,
       f.status_label AS stage_status_label,
       f.current_team_name AS stage_team_name,
       f.current_org_or_conference_name AS stage_org_name,
       f.current_teamid::text AS current_teamid
     FROM public.news_articles na
     LEFT JOIN public.flip_card_front_stage f
       ON f.playerid::text = na.playerid::text
     LEFT JOIN public.news_article_derivatives nd
       ON nd.news_article_uuid = na.uuid
      AND nd.playerid = na.playerid
     WHERE na.hsid = ANY($1::text[])
       AND na.verification_status = 'VERIFIED'
       AND COALESCE(na.newsworthiness, 'NORMAL') <> 'LOW'
       AND NULLIF(TRIM(COALESCE(na.playerid, '')), '') IS NOT NULL
       AND nd.id IS NULL
     ORDER BY na.published_at DESC, na.id DESC
     ${limitClause}`,
    params
  );

  return rows;
}

async function writeDerivative(row: CandidateRow): Promise<boolean> {
  const d = buildDerivative(row);

  const result = await pool.query(
    `INSERT INTO public.news_article_derivatives (
       news_article_uuid,
       playerid,
       hsid,
       teamid,
       story_type,
       story_scope,
       player_relevance,
       match_confidence,
       story_grade,
       source_headline,
       source_url,
       source_name,
       source_published_at,
       source_image_url,
       tease_json,
       gallery_front_json,
       gallery_back_json,
       profile_json,
       share_json,
       generation_status,
       approval_status,
       created_at,
       updated_at
     ) VALUES (
       $1,$2,$3,$4,
       'article',$5,$6,$7,$8,
       $9,$10,$11,$12,$13,
       $14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb,
       'staged','approved',NOW(),NOW()
     )
     ON CONFLICT (news_article_uuid, playerid) DO NOTHING`,
    [
      row.uuid,
      row.playerid,
      row.hsid,
      row.current_teamid || null,
      d.storyScope,
      d.playerRelevance,
      d.score || null,
      d.storyGrade,
      row.title,
      row.url,
      row.source_full || row.source,
      row.published_at,
      row.display_image_url || row.image_url || null,
      JSON.stringify(d.tease),
      JSON.stringify(d.galleryFront),
      JSON.stringify(d.galleryBack),
      JSON.stringify(d.profile),
      JSON.stringify(d.share),
    ]
  );

  if ((result.rowCount || 0) > 0) {
    await pool.query(
      `UPDATE public.news_articles
          SET local_recap = COALESCE(NULLIF(TRIM(local_recap), ''), $3)
        WHERE uuid = $1
          AND playerid = $2`,
      [row.uuid, row.playerid, d.recap]
    );
    return true;
  }
  return false;
}

async function main() {
  console.log("=== YAT?STATS News Derivative Generator ===");
  console.log(`Schools: ${targetHsids.join(", ")}`);

  const candidates = await loadCandidates();
  console.log(`Missing verified derivatives: ${candidates.length}`);

  let generated = 0;
  let failed = 0;

  for (const row of candidates) {
    try {
      if (await writeDerivative(row)) generated += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `Derivative failed for ${row.player_name || row.playerid}: ${row.title}`,
        error
      );
    }
  }

  console.log(`Generated: ${generated}`);
  console.log(`Failed: ${failed}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        "",
        "## News recap / derivative generation",
        "",
        "| | |",
        "|---|---|",
        `| Schools | ${targetHsids.join(", ")} |`,
        `| Verified stories missing derivatives | ${candidates.length} |`,
        `| Derivatives generated | ${generated} |`,
        `| Failures | ${failed} |`,
      ].join("\n") + "\n"
    );
  }

  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
