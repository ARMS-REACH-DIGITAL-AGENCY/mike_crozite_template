import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTbcPlayersBody } from "../src/lib/tbcPlayerCsv.ts";

const header = "playerid,firstname,lastname,highlevel,ht,wt,bats,throws,posit,borndate,currentage,place,high_school";
const physicalLines = [header];
for (let n = 1; n <= 208427; n++) {
  const playerId = 400000 + n;
  let line = String(playerId) + ",First,Last,NCAA,6-2,180,R,R,P,,,Town,School";
  if (n === 87667) line = '248578,Robby,Butenschoen,Indy,"6-2"",170,R,R,P,8/7/2001,25.088,"Happy Valley,OR","Clackamas (Clackamas,OR)"';
  if (n === 124536) line = '214777,Jemison,AL,Wiley,NCAA,"6-1",165,R,R,IF,3/31/1999,27.217,"Birmingham,AL","Ramsay (Birmingham,AL)"';
  if (n === 195025) line = '266578,Xavier,Olivas,NAIA,"6-3"",190,R,R,P,,,"--,--","Raymond S. Kellis (Glendale,AZ)"';
  physicalLines.push(line);
}
const synthetic = parseTbcPlayersBody(physicalLines.join("\n") + "\n");
assert.equal(synthetic.sourceRows, 208427);
assert.equal(synthetic.uniquePlayerIds, 208427);
assert.equal(synthetic.validRows, 208424);
assert.deepEqual(synthetic.rejects.map(r => r.playerid).sort(), ["214777", "248578", "266578"]);
assert.equal(synthetic.rows.length, 0, "capture-only mode must not retain a 208K row-array");
console.log("PASS: 208427 physical records, 208427 unique IDs; three source exceptions isolated");
assert.throws(() => parseTbcPlayersBody(physicalLines.slice(0, 101082).join("\n")), /INCOMPLETE_PLAYERS_FEED/);
console.log("PASS: the former 101081-record false-success result is rejected");
assert.throws(() => parseTbcPlayersBody(header + "\n1,A,B,NCAA,6-1,185,R,R,P,,,Town,School\n1,A,B,NCAA,6-1,185,R,R,P,,,Town,School"), /Duplicate TBC Player ID/);
console.log("PASS: duplicate Player IDs rejected");
if (process.env.TBC_LIVE_TEST === "1") {
  const src = readFileSync("src/app/api/cron/tbc-safe-ingest/route.ts", "utf8");
  const match = src.match(/players:\s*\{\s*url:\s*"([^"]+)"/);
  if (!match || !match[1].startsWith("https://www.thebaseballcube.com/")) throw new Error("unexpected live origin");
  const response = await fetch(match[1], {
    headers: { "User-Agent": "Mozilla/5.0 YATSTATS Feed Verification",
      Referer: "https://www.thebaseballcube.com/", Accept: "text/csv,text/html,*/*", "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error("Live feed HTTP status " + response.status);
  const source = (await response.text()).replace(/<br\s*\/?>/gi, "\n").trim();
  const full = parseTbcPlayersBody(source, false);
  console.log("LIVE_SOURCE_VALIDATED", JSON.stringify({
    sourceRows: full.sourceRows, uniquePlayerIds: full.uniquePlayerIds,
    validRows: full.validRows, quarantinedIds: full.rejects.map(r => r.playerid),
  }));
  assert.equal(full.sourceRows, full.uniquePlayerIds);
  assert.ok(full.uniquePlayerIds >= 208427);
}
