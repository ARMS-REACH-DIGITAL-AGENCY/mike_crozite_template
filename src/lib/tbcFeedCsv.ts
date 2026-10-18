const MAX_HEADER_COLUMNS = 200;
const MAX_SKIPPED_ROW_SAMPLES = 10;

type SkippedRowReason = "column_count_mismatch";

export type SkippedCsvRow = {
  // CSV record number, including the header; quoted fields may span lines.
  recordNumber: number;
  reason: SkippedRowReason;
  expectedColumns: number;
  actualColumns: number;
};

export type TbcCsvValidation = {
  skippedRows: number;
  skippedByReason: Partial<Record<SkippedRowReason, number>>;
  skippedRowSamples: SkippedCsvRow[];
  omittedSkippedRowSamples: number;
};

export type TbcCsvFeed = {
  headers: string[];
  rows: string[][];
  downloadedRows: number;
  validation: TbcCsvValidation;
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .replace(/^2b$/, "dbl")
    .replace(/^3b$/, "tpl");
}

// A quote starts a quoted field only at its beginning. TBC sometimes supplies
// literal quotes inside an unquoted value; treating those as quote boundaries
// previously swallowed thousands of subsequent player records.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let recordStarted = false;

  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    recordStarted = true;

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"' && cell.length === 0) {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (ch === "\n" || ch === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      recordStarted = false;
      if (ch === "\r" && next === "\n") i++;
      continue;
    }

    cell += ch;
  }

  // There is no reliable record boundary after an unclosed quoted field.
  // Reject the feed so a partial parse cannot replace canonical statistics.
  if (inQuotes) {
    throw new Error("CSV has an unterminated quoted field in record " + (rows.length + 1));
  }

  if (recordStarted) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function parseTbcFeedCsv(text: string): TbcCsvFeed {
  const parsed = parseCsv(text);
  if (!parsed.length) throw new Error("CSV feed was empty");

  const headers = parsed[0].map((value, index) => normalizeHeader(value) || "col_" + (index + 1));
  if (headers.length > MAX_HEADER_COLUMNS) {
    throw new Error("CSV header has " + headers.length + " columns; maximum is " + MAX_HEADER_COLUMNS);
  }
  if (!headers.includes("playerid")) throw new Error("CSV header missing playerid");
  if (new Set(headers).size !== headers.length) {
    throw new Error("CSV header has duplicate normalized column names");
  }

  const rows: string[][] = [];
  let downloadedRows = 0;
  const validation: TbcCsvValidation = {
    skippedRows: 0,
    skippedByReason: {},
    skippedRowSamples: [],
    omittedSkippedRowSamples: 0,
  };

  for (let index = 1; index < parsed.length; index++) {
    const row = parsed[index];
    if (!row.some((value) => value.trim() !== "")) continue;
    downloadedRows++;

    if (row.length !== headers.length) {
      validation.skippedRows++;
      validation.skippedByReason.column_count_mismatch =
        (validation.skippedByReason.column_count_mismatch || 0) + 1;
      if (validation.skippedRowSamples.length < MAX_SKIPPED_ROW_SAMPLES) {
        validation.skippedRowSamples.push({
          recordNumber: index + 1,
          reason: "column_count_mismatch",
          expectedColumns: headers.length,
          actualColumns: row.length,
        });
      } else {
        validation.omittedSkippedRowSamples++;
      }
      continue;
    }

    rows.push(row);
  }

  return { headers, rows, downloadedRows, validation };
}

// Defense at the database boundary: even a caller that bypasses feed
// validation cannot silently pad a short row or truncate a long one.
export function assertTbcCsvRowWidths(headers: string[], rows: string[][]): void {
  for (let index = 0; index < rows.length; index++) {
    if (rows[index].length !== headers.length) {
      throw new Error(
        "Unvalidated CSV row " + (index + 1) + ": expected " + headers.length +
        " columns, got " + rows[index].length,
      );
    }
  }
}
