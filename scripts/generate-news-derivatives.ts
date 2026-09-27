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
//   * only VERIFIED stories are eligible (LOW ones too - the profile feed
//     shows them, and a reader must never open blank)
//   * the recap is built from clean, whole sentences that name the player
//     (or continue about him: "He...", "His..."). Stat lines, roster tables
//     and site boilerplate ("Subscribe", "Try it free") are never used, and
//     a recap never ends mid-sentence
//   * a story that isn't about him (not FEATURED) and has no clean sentence
//     about him is marked approval_status='rejected'; the news feeds leave
//     rejected stories out
//   * existing derivatives are preserved (manual/editorial work wins);
//     --regenerate rewrites only the ones this generator wrote
//   * --dry-run prints old vs new recaps and writes nothing
//
// Usage:
//   npx tsx scripts/generate-news-derivatives.ts --hsid 5004            # new stories only
//   npx tsx scripts/generate-news-derivatives.ts --regenerate --dry-run # preview a rewrite
//   npx tsx scripts/generate-news-derivatives.ts --regenerate           # rewrite generated recaps

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
const regenerate = args.includes("--regenerate");
const dryRun = args.includes("--dry-run");

// Written into every derivative this script makes, so --regenerate can tell
// its own work from a hand edit. (Untagged rows predate the tag; nothing but
// this script has ever written derivatives, so those count as generated.)
const GENERATOR = "auto-v2";

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
  existing_recap?: string | null;
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
    .replace(/\[\s*read more[^\]]*\]/gi, " ")
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

// Pieces joined in order while the total stays within max. The first piece
// is always kept; nothing is ever cut mid-sentence.
function fitSentences(parts: string[], max: number): string {
  const kept: string[] = [];
  let length = 0;
  for (const part of parts.map((p) => p.trim()).filter(Boolean)) {
    const added = (kept.length ? 1 : 0) + part.length;
    if (kept.length && length + added > max) break;
    kept.push(part);
    length += added;
  }
  return kept.join(" ");
}

const BOILERPLATE =
  /(subscri|sign up|newsletter|try it free|free trial|join (the )?\w+\s*\+|access the|podcast|click here|read more|cookie|advertis|all rights reserved|©|follow us|download the app|terms of (use|service)|privacy policy|getty images|photo by|image credit|watch:|listen:)/i;

// A stat line or roster table: "(1-for-7, HBP, 2 R)", "4 IP", "[AA]", "N/A".
const STAT_MARKERS = /\(\d+-for-\d+|\b\d+(\.\d)? IP\b|\b\d+ K\b|\bN\/A\b|\[[A-Z+]{1,4}\]|\b\d+-\d+,|\bK-BB%|\bwRC\+/g;

// A real, readable sentence: starts like a sentence, ends with punctuation,
// reasonable length, not a table, stat dump or site boilerplate.
function isCleanSentence(sentence: string): boolean {
  const s = sentence.trim();
  if (s.length < 40 || s.length > 320) return false;
  if (!/^["'‘“(]?[A-Z0-9]/.test(s)) return false;
  if (!/[.!?]["'’”)]?$/.test(s)) return false;
  if (s.split(/\s+/).length < 7) return false;
  if (s.includes("|")) return false;
  if (BOILERPLATE.test(s)) return false;
  if ((s.match(STAT_MARKERS) || []).length >= 2) return false;
  if ((s.match(/,/g) || []).length > 5) return false;
  const digits = (s.match(/\d/g) || []).length;
  if (digits / s.length > 0.15) return false;
  return true;
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

// Every text field the story came with, best first: the provider summary,
// then the highlight, snippet and full text. The summary is often generic,
// so the recap looks further down when it says nothing about him.
function sourceTexts(row: CandidateRow): string[] {
  const raw = row.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : {};
  const texts = [row.summary, raw.summary, raw.highlightText, row.snippet, raw.text]
    .map((value) => cleanText(value || ""))
    .filter(Boolean);
  return Array.from(new Set(texts));
}

// Clean sentences about him, in article order: ones that name him (full
// name, or last name if it's distinctive), each optionally followed by one
// that continues about him ("He...", "His..."). At most three.
// Uses the first text field that has a clean sentence about him.
function selectPlayerContext(row: CandidateRow, fullName: string, lastName: string): string[] {
  for (const text of sourceTexts(row)) {
    const selected = selectContextFrom(text, fullName, lastName);
    if (selected.length > 0) return selected;
  }
  return [];
}

function selectContextFrom(text: string, fullName: string, lastName: string): string[] {
  const sentences = sentenceList(text);
  const full = fullName.toLowerCase();
  // Last name alone counts only as a capitalized word in a story that also
  // names him in full - "Ball" must not match "the ball" or "Ball State".
  const lastPattern =
    lastName.length >= 4 && full && text.toLowerCase().includes(full)
      ? new RegExp(`\\b${lastName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b(?! State)`)
      : null;
  const namesHim = (sentence: string) =>
    (full && sentence.toLowerCase().includes(full)) || Boolean(lastPattern && lastPattern.test(sentence));

  const selected: string[] = [];
  const used = new Set<number>();
  for (let i = 0; i < sentences.length && selected.length < 3; i++) {
    if (used.has(i) || !namesHim(sentences[i]) || !isCleanSentence(sentences[i])) continue;
    selected.push(sentences[i]);
    used.add(i);
    const next = sentences[i + 1];
    if (next && selected.length < 3 && /^(He|His|Him)\b/.test(next) && isCleanSentence(next)) {
      selected.push(next);
      used.add(i + 1);
    }
  }
  return selected;
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

  const lead =
    playerRelevance === "primary"
      ? `${fullName} is the focus of this ${domain} story.`
      : playerRelevance === "secondary"
        ? `${fullName} is featured in this ${domain} story.`
        : `${fullName} gets a mention in this ${domain} story.`;

  // His name is in the headline, so the story is about him even when the
  // body has no clean sentence to quote. Otherwise, no clean sentence about
  // him means it isn't really news about him: keep it off the feeds.
  const publishable = playerRelevance === "primary" || context.length > 0;

  const recap = fitSentences([lead, ...context], 520);
  const profileBody = fitSentences(
    [
      lead,
      ...context,
      team ? `YAT?STATS currently tracks ${fullName} with ${team}${org ? ` in ${org}` : ""}.` : "",
    ],
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
    publishable,
    publishedDate,
    domain,
    tease: {
      headline: row.title,
      badge: level ? `${level} UPDATE` : "ALUMNI UPDATE",
      body: fitSentences([lead, ...context], 300),
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
      generator: GENERATOR,
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
      generator: GENERATOR,
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
       f.current_teamid::text AS current_teamid,
       nd.gallery_back_json->>'yati_recap' AS existing_recap
     FROM public.news_articles na
     LEFT JOIN public.flip_card_front_stage f
       ON f.playerid::text = na.playerid::text
     LEFT JOIN public.news_article_derivatives nd
       ON nd.news_article_uuid = na.uuid
      AND nd.playerid = na.playerid
     WHERE na.hsid = ANY($1::text[])
       AND na.verification_status = 'VERIFIED'
       AND NULLIF(TRIM(COALESCE(na.playerid, '')), '') IS NOT NULL
       AND ${
         regenerate
           ? `(nd.id IS NULL OR COALESCE(nd.gallery_back_json->>'generator', 'auto') LIKE 'auto%')`
           : "nd.id IS NULL"
       }
     ORDER BY na.published_at DESC, na.id DESC
     ${limitClause}`,
    params
  );

  return rows;
}

async function writeDerivative(row: CandidateRow, d: ReturnType<typeof buildDerivative>): Promise<boolean> {
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
       'staged',$19,NOW(),NOW()
     )
     ON CONFLICT (news_article_uuid, playerid) ${
       regenerate
         ? `DO UPDATE SET
              story_scope = EXCLUDED.story_scope,
              player_relevance = EXCLUDED.player_relevance,
              match_confidence = EXCLUDED.match_confidence,
              story_grade = EXCLUDED.story_grade,
              tease_json = EXCLUDED.tease_json,
              gallery_front_json = EXCLUDED.gallery_front_json,
              gallery_back_json = EXCLUDED.gallery_back_json,
              profile_json = EXCLUDED.profile_json,
              share_json = EXCLUDED.share_json,
              approval_status = EXCLUDED.approval_status,
              updated_at = NOW()`
         : "DO NOTHING"
     }`,
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
      d.publishable ? "approved" : "rejected",
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

  if (regenerate) console.log("Mode: rewrite this generator's recaps");
  if (dryRun) console.log("DRY RUN: nothing is written");

  const candidates = await loadCandidates();
  console.log(`${regenerate ? "Verified stories to (re)generate" : "Missing verified derivatives"}: ${candidates.length}`);

  let generated = 0;
  let failed = 0;
  let hidden = 0;

  for (const row of candidates) {
    try {
      const d = buildDerivative(row);
      if (!d.publishable) hidden += 1;
      if (dryRun) {
        console.log(`\n── ${row.player_name || row.playerid} · ${row.title}`);
        console.log(`   OLD: ${row.existing_recap || "(none)"}`);
        console.log(`   NEW: ${d.recap}${d.publishable ? "" : "   [hidden: no clean sentence about him]"}`);
        continue;
      }
      if (await writeDerivative(row, d)) generated += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `Derivative failed for ${row.player_name || row.playerid}: ${row.title}`,
        error
      );
    }
  }

  console.log(`\nGenerated: ${generated}`);
  console.log(`Hidden (no clean sentence about him, not featured): ${hidden}`);
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
        `| Hidden (no clean sentence about him) | ${hidden} |`,
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
