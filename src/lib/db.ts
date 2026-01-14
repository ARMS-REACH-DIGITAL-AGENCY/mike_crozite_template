// src/lib/db.ts
import { Pool, type PoolConfig, type QueryResult } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("Missing DATABASE_URL environment variable");
}

const PG_MAX_POOL = Number(process.env.PG_MAX_POOL ?? 10);
const PG_IDLE_TIMEOUT_MS = Number(process.env.PG_IDLE_TIMEOUT_MS ?? 30_000);
const PG_CONNECTION_TIMEOUT_MS = Number(process.env.PG_CONNECTION_TIMEOUT_MS ?? 2_000);

// Neon typically requires TLS. We'll enable SSL automatically unless explicitly disabled.
const ssl =
  process.env.PGSSLMODE === "disable" || process.env.DATABASE_SSL === "false"
    ? undefined
    : { rejectUnauthorized: false };

// Reuse a single pool across hot reloads / lambda invocations.
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function getPool() {
  if (!global.__pgPool) {
    const config: PoolConfig = {
      connectionString: DATABASE_URL,
      max: PG_MAX_POOL,
      idleTimeoutMillis: PG_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: PG_CONNECTION_TIMEOUT_MS,
      ssl,
    };
    global.__pgPool = new Pool(config);
  }
  return global.__pgPool;
}

export async function query<T = any>(
  text: string,
  params: any[] = []
): Promise<QueryResult<T>> {
  const pool = getPool();
  return pool.query<T>(text, params);
}

export async function shutdownPool() {
  if (global.__pgPool) {
    await global.__pgPool.end();
    global.__pgPool = undefined;
  }
}

/**
 * Lookup a roster by HSID (safe: compute name rather than referencing a 'name' column)
 */
export async function getRosterByHsid(hsid: string) {
  const sql = `
    SELECT
      hs_rosters_simple.*,
      TRIM(CONCAT_WS(' ', firstname, lastname)) AS name
    FROM public.hs_rosters_simple
    WHERE hsid::text = $1
    ORDER BY
      COALESCE(NULLIF(lastname,''), TRIM(CONCAT_WS(' ', firstname, lastname))) NULLS LAST,
      firstname NULLS LAST
  `;
  const { rows } = await query(sql, [hsid]);
  return rows;
}

/**
 * If your codebase previously had another getRosterByHsid variant,
 * use this renamed export instead of reintroducing a duplicate name.
 */
export const getRosterByHsidLegacy = getRosterByHsid;

export async function getRosterByHighSchool(highSchool: string) {
  const sql = `
    SELECT
      hs_rosters_simple.*,
      TRIM(CONCAT_WS(' ', firstname, lastname)) AS name
    FROM public.hs_rosters_simple
    WHERE high_school = $1
    ORDER BY
      COALESCE(NULLIF(lastname,''), TRIM(CONCAT_WS(' ', firstname, lastname))) NULLS LAST,
      firstname NULLS LAST
  `;
  const { rows } = await query(sql, [highSchool]);
  return rows;
}

/**
 * Optional helpers
 * Table: player_high_school_info_for_2025_season
 */
export async function getSchoolByHsid(hsid: string) {
  const sql = `
    SELECT *
    FROM public.player_high_school_info_for_2025_season
    WHERE hsid::text = $1
    LIMIT 1
  `;
  const { rows } = await query(sql, [hsid]);
  return rows[0] ?? null;
}

export async function getSchoolByStagingUrl(stagingUrl: string) {
  const sql = `
    SELECT *
    FROM public.player_high_school_info_for_2025_season
    WHERE staging_url = $1
    LIMIT 1
  `;
  const { rows } = await query(sql, [stagingUrl]);
  return rows[0] ?? null;
}

export async function getSchoolByMicrositeUrl(micrositeUrl: string) {
  const sql = `
    SELECT *
    FROM public.player_high_school_info_for_2025_season
    WHERE microsite_url = $1
    LIMIT 1
  `;
  const { rows } = await query(sql, [micrositeUrl]);
  return rows[0] ?? null;
}

/**
 * Host-based lookup.
 * Supports:
 * - full host match -> tries both staging_url and microsite_url
 */
export async function getSchoolByHost(host: string) {
  const normalized = (host || "").toLowerCase().split(":")[0];

  const sql = `
    SELECT *
    FROM public.player_high_school_info_for_2025_season
    WHERE LOWER(staging_url) = $1
       OR LOWER(microsite_url) = $1
    LIMIT 1
  `;
  const { rows } = await query(sql, [normalized]);
  return rows[0] ?? null;
}