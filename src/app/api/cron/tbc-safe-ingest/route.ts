import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const FEEDS = {
  players: {
    url: "https://www.thebaseballcube.com/data/feed/yatstats/players/?pw=yattbc",
    landingTable: "public.tbc_players_landing_latest",
    targetTable: "public.tbc_players_raw",
  },
  batting: {
    url: "https://www.thebaseballcube.com/data/feed/yatstats/batting/?pw=yattbc",
    landingTable: "public.tbc_batting_landing_latest",
    targetTable: "public.tbc_batting_2026_season_raw",
  },
  pitching: {
    url: "https://www.thebaseballcube.com/data/feed/yatstats/pitching/?pw=yattbc",
    landingTable: "public.tbc_pitching_landing_latest",
    targetTable: "public.tbc_pitching_2026_season_raw",
  },
} as const;

type FeedKey = keyof typeof FEEDS;

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const bearer = req.headers.get("authorization") || "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
  const qp = req.nextUrl.searchParams.get("secret") || "";

  return token === expected || qp === expected;
}

function quoteIdent(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function splitQualifiedTableName(value: string): { schema: string; table: string } {
  const [schema, table] = value.split(".");
  if (!schema || !table) {
    throw new Error(`Expected qualified table name, got: ${value}`);
  }
  return { schema, table };
}

function normalizeHeader(value: string): string {
  return String(value || "")
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

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

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

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (ch === "\r") continue;

    cell += ch;
  }

  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

async function fetchCsvRows(url: string): Promise<{ headers: string[]; rows: string[][] }> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0 YATSTATS Vercel Cron",
      Accept: "text/csv,text/plain,text/html,*/*",
      Referer: "https://www.thebaseballcube.com/",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  let body = await res.text();
  const contentType = res.headers.get("content-type") || "";
  const preview = body.slice(0, 500).replace(/\s+/g, " ").trim();

  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} ${res.statusText}: ${preview}`);
  }

  const lowerBody = body.slice(0, 4000).toLowerCase();
  const lowerType = contentType.toLowerCase();

  const clearlyBlocked =
    lowerBody.includes("cloudflare") ||
    lowerBody.includes("forbidden") ||
    lowerBody.includes("access denied") ||
    lowerBody.includes("just a moment") ||
    lowerBody.includes("checking your browser");

  if (clearlyBlocked) {
    throw new Error(`TBC returned blocked/challenge HTML. content-type=${contentType}. preview=${preview}`);
  }

  const looksLikeTbcHtmlWrappedCsv =
    lowerType.includes("text/html") &&
    lowerBody.includes("playerid") &&
    (lowerBody.includes("<br") || lowerBody.includes("\\u003cbr"));

  if (looksLikeTbcHtmlWrappedCsv) {
    body = body
      .replace(/\\u003cbr\\u003e/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?html[^>]*>/gi, "")
      .replace(/<\/?body[^>]*>/gi, "")
      .replace(/<\/?pre[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "")
      .trim();
  } else if (lowerType.includes("text/html")) {
    throw new Error(`TBC returned HTML instead of CSV. content-type=${contentType}. preview=${preview}`);
  }

  const parsed = parseCsv(body);
  if (!parsed.length) {
    throw new Error(`CSV was empty for ${url}`);
  }

  const rawHeaders = parsed[0].map(normalizeHeader);
  const headers = rawHeaders.map((h, idx) => h || `col_${idx + 1}`);

  if (headers.length > 200) {
    throw new Error(
      `Header sanity check failed: got ${headers.length} columns. This is not a valid TBC CSV header. preview=${preview}`,
    );
  }

  if (!headers.includes("playerid")) {
    throw new Error(`CSV header missing playerid. preview=${preview}`);
  }

  const rows = parsed
    .slice(1)
    .filter((r) => r.some((v) => String(v || "").trim() !== ""));

  return { headers, rows };
}

async function recreateLandingTable(
  client: any,
  qualifiedTable: string,
  headers: string[],
): Promise<void> {
  const { schema, table } = splitQualifiedTableName(qualifiedTable);

  await client.query(`create schema if not exists ${quoteIdent(schema)}`);
  await client.query(`drop table if exists ${quoteIdent(schema)}.${quoteIdent(table)}`);

  const colsSql = headers.map((h) => `${quoteIdent(h)} text`).join(", ");
  await client.query(`
    create table ${quoteIdent(schema)}.${quoteIdent(table)} (
      ${colsSql}
    )
  `);
}

async function insertLandingRows(
  client: any,
  qualifiedTable: string,
  headers: string[],
  rows: string[][],
): Promise<number> {
  if (!rows.length) return 0;

  const { schema, table } = splitQualifiedTableName(qualifiedTable);
  const colsSql = headers.map(quoteIdent).join(", ");
  const batchSize = 500;
  let inserted = 0;

  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values: any[] = [];
    const tuples: string[] = [];

    for (const row of batch) {
      const padded = headers.map((_, idx) => (row[idx] ?? "").trim());
      const placeholders: string[] = [];

      for (const value of padded) {
        values.push(value === "" ? null : value);
        placeholders.push(`$${values.length}`);
      }

      tuples.push(`(${placeholders.join(", ")})`);
    }

    await client.query(
      `
      insert into ${quoteIdent(schema)}.${quoteIdent(table)} (${colsSql})
      values ${tuples.join(", ")}
      `,
      values,
    );

    inserted += batch.length;
  }

  return inserted;
}

async function getTargetColumns(client: any, qualifiedTable: string): Promise<string[]> {
  const { schema, table } = splitQualifiedTableName(qualifiedTable);
  const { rows } = await client.query(
    `
    select column_name
    from information_schema.columns
    where table_schema = $1
      and table_name = $2
    order by ordinal_position
    `,
    [schema, table],
  );
  return rows.map((r: any) => r.column_name);
}

async function replaceTargetFromLanding(
  client: any,
  landingTable: string,
  targetTable: string,
  landingHeaders: string[],
): Promise<number> {
  const targetCols = await getTargetColumns(client, targetTable);
  const commonCols = targetCols.filter((c) => landingHeaders.includes(c));

  if (!commonCols.length) {
    throw new Error(`No common columns between ${landingTable} and ${targetTable}`);
  }

  const quotedCols = commonCols.map(quoteIdent).join(", ");
  await client.query(`truncate table ${targetTable}`);
  await client.query(`
    insert into ${targetTable} (${quotedCols})
    select ${quotedCols}
    from ${landingTable}
  `);

  const { rows } = await client.query(`select count(*)::text as count from ${targetTable}`);
  return Number(rows[0]?.count || 0);
}

async function mergePlayersFromLanding(
  client: any,
  landingTable: string,
  targetTable: string,
  landingHeaders: string[],
): Promise<number> {
  const targetCols = await getTargetColumns(client, targetTable);
  const commonCols = targetCols.filter((c) => landingHeaders.includes(c));

  if (!commonCols.includes("playerid")) {
    throw new Error(`No common playerid column between ${landingTable} and ${targetTable}`);
  }

  const updateCols = commonCols.filter((c) => c !== "playerid");

  if (updateCols.length) {
    const assignments = updateCols
      .map((c) => `${quoteIdent(c)} = l.${quoteIdent(c)}`)
      .join(", ");

    await client.query(`
      update ${targetTable} as t
      set ${assignments}
      from ${landingTable} as l
      where t.playerid::text = l.playerid::text
        and l.playerid is not null
        and trim(l.playerid::text) <> ''
    `);
  }

  const quotedCols = commonCols.map(quoteIdent).join(", ");

  await client.query(`
    insert into ${targetTable} (${quotedCols})
    select ${quotedCols}
    from ${landingTable} as l
    where l.playerid is not null
      and trim(l.playerid::text) <> ''
      and not exists (
        select 1
        from ${targetTable} as t
        where t.playerid::text = l.playerid::text
      )
  `);

  const { rows } = await client.query(`select count(*)::text as count from ${targetTable}`);
  return Number(rows[0]?.count || 0);
}

async function syncOneFeed(client: any, feed: FeedKey) {
  const cfg = FEEDS[feed];
  const { headers, rows } = await fetchCsvRows(cfg.url);

  await recreateLandingTable(client, cfg.landingTable, headers);
  const insertedRows = await insertLandingRows(client, cfg.landingTable, headers, rows);

  const targetRows = feed === "players"
    ? await mergePlayersFromLanding(client, cfg.landingTable, cfg.targetTable, headers)
    : await replaceTargetFromLanding(client, cfg.landingTable, cfg.targetTable, headers);

  return {
    feed,
    downloadedRows: rows.length,
    insertedRows,
    targetRows,
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const results = [];
    results.push(await syncOneFeed(client, "players"));
    results.push(await syncOneFeed(client, "batting"));
    results.push(await syncOneFeed(client, "pitching"));

    await client.query("commit");

    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      results,
    });
  } catch (error: any) {
    await client.query("rollback");
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "sync failed",
      },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
