import assert from "node:assert/strict";
import { validateNewsEditorial, type NewsEditorialInput } from "./lib/playerNewsEditorial";

const source = [
  "The Athletics declined Jeff McNeil's team option, opening second base.",
  "Las Vegas Aviators shortstop Drew Swift is among the players under consideration.",
  "The report also names Jacob Wilson and Leo De Vries as other possibilities.",
  "No promotion or starting appointment was announced.",
].join(" ");
const player: NewsEditorialInput = {
  playerName: "Drew Swift",
  highSchool: "Hamilton High School",
  classOf: "2019",
  currentTeam: "Las Vegas Aviators",
  currentOrg: "Athletics",
  sourceTitle: "Athletics weigh options",
  sourceName: "Example",
  sourceUrl: "https://example.com/sports",
  publishedAt: "2026-11-01",
  articleText: source,
};
const good = {
  decision: "publish" as const,
  headline: "Drew Swift in contention as Athletics weigh second-base options",
  recap: "Drew Swift has emerged as one of the possible solutions at second base for the Athletics after the club declined Jeff McNeil's option. The Hamilton alumnus is one of several players named in the report, which does not announce a promotion or a decision about who will start. His situation remains an opportunity rather than a confirmed major-league assignment.",
  newsworthiness: "FEATURED" as const,
  evidence_quotes: [
    "Las Vegas Aviators shortstop Drew Swift is among the players under consideration.",
    "The Athletics declined Jeff McNeil's team option, opening second base.",
  ],
};
assert.equal(validateNewsEditorial(good,player)?.kind,"story");
assert.equal(validateNewsEditorial({...good,recap:"Drew Swift gets a mention in this article."},player),null);
assert.equal(validateNewsEditorial({...good,headline:"Drew Swift is promoted to the majors"},player),null);
assert.equal(validateNewsEditorial({...good,evidence_quotes:["No quote about Drew Swift is in the original source"]},player),null);
assert.equal(validateNewsEditorial({...good,decision:"skip" as const},player),null);
assert.equal(validateNewsEditorial(good,{...player,articleText:"A different player is mentioned."}),null);
console.log("PASS: source-grounded news validator rejects generic mentions, missing quotes and invented promotions");
