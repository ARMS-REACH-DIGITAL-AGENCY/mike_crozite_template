/**
 * TBC Players has one CSV record per physical <br> line. Parse rows
 * independently so stray quotes cannot swallow adjacent player records.
 * Invalid rows retain their source Player IDs but never leak fields.
 */
export const MIN_VERIFIED_TBC_PLAYER_IDS = 208_427;

export const TBC_PLAYERS_HEADERS = [
  "playerid", "firstname", "lastname", "highlevel", "ht", "wt", "bats",
  "throws", "posit", "borndate", "currentage", "place", "high_school",
] as const;

export type TbcPlayerReject = {
  sourceRow: number;
  playerid: string;
  reason: string;
  rawLine: string;
};

export type TbcPlayersParse = {
  headers: string[];
  rows: string[][];
  sourceRows: number;
  uniquePlayerIds: number;
  validRows: number;
  rejects: TbcPlayerReject[];
};

type LineResult = { cells: string[]; error: string | null };

function parsePhysicalCsvLine(line: string): LineResult {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let quotedClosed = false;
  let atFieldStart = true;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
        quotedClosed = true;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === ",") {
      cells.push(cell);
      cell = "";
      quotedClosed = false;
      atFieldStart = true;
      continue;
    }

    if (quotedClosed) {
      if (ch === " " || ch === "\t") continue;
      return { cells: [], error: "TRAILING_TEXT_AFTER_QUOTED_FIELD" };
    }

    if (ch === '"') {
      if (!atFieldStart) return { cells: [], error: "UNQUOTED_OR_STRAY_QUOTE" };
      inQuotes = true;
      atFieldStart = false;
      continue;
    }

    if (ch === "\r") continue;
    cell += ch;
    atFieldStart = false;
  }

  if (inQuotes) return { cells: [], error: "UNCLOSED_QUOTED_FIELD" };
  cells.push(cell);
  return { cells, error: null };
}

function cleanHeaders(values: string[]): string[] {
  return values.map((v) => v.trim().replace(/^\uFEFF/, "").toLowerCase().replace(/\s+/g, "_"));
}

/** The caller has converted HTML <br> separators to newlines. */
export function parseTbcPlayersBody(body: string, retainRows = false): TbcPlayersParse {
  const physicalRows = body.split(/\r?\n/);
  while (physicalRows.length && !physicalRows[physicalRows.length - 1].trim()) physicalRows.pop();
  const headerLine = physicalRows.shift();
  if (!headerLine) throw new Error("TBC Players feed has no header");
  const headerResult = parsePhysicalCsvLine(headerLine);
  if (headerResult.error) throw new Error("TBC Players header malformed: " + headerResult.error);
  const headers = cleanHeaders(headerResult.cells);
  if (headers.length !== TBC_PLAYERS_HEADERS.length ||
      headers.some((h, i) => h !== TBC_PLAYERS_HEADERS[i])) {
    throw new Error("TBC Players feed schema mismatch: " + headers.join(","));
  }

  const ids = new Set<string>();
  const accepted: string[][] = [];
  const rejects: TbcPlayerReject[] = [];
  let sourceRows = 0;
  let validRows = 0;

  for (let index = 0; index < physicalRows.length; index++) {
    const line = physicalRows[index];
    if (!line.trim()) continue;
    const sourceRow = index + 2;
    sourceRows++;

    const match = /^(\d+),/.exec(line);
    const playerid = match?.[1] || "";
    if (!playerid) throw new Error("TBC Players source has invalid Player ID at row " + sourceRow);
    if (ids.has(playerid)) throw new Error("Duplicate TBC Player ID " + playerid + " at row " + sourceRow);
    ids.add(playerid);

    const parsed = parsePhysicalCsvLine(line);
    let reason = parsed.error;
    if (!reason && parsed.cells.length !== headers.length) {
      reason = "COLUMN_COUNT_" + parsed.cells.length + "_EXPECTED_" + headers.length;
    }
    if (!reason && parsed.cells[0].trim() !== playerid) reason = "PLAYERID_MISMATCH";

    if (reason) {
      rejects.push({ playerid, sourceRow, reason, rawLine: line });
      continue;
    }

    validRows++;
    if (retainRows) accepted.push(parsed.cells);
  }

  if (sourceRows !== ids.size) {
    throw new Error("TBC Players source row/unique ID mismatch: " + sourceRows + "/" + ids.size);
  }
  if (ids.size < MIN_VERIFIED_TBC_PLAYER_IDS) {
    throw new Error("INCOMPLETE_PLAYERS_FEED: " + ids.size +
      " unique IDs, minimum verified baseline " + MIN_VERIFIED_TBC_PLAYER_IDS);
  }

  return { headers, rows: accepted, sourceRows, uniquePlayerIds: ids.size, validRows, rejects };
}
