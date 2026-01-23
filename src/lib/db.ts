// src/lib/db.ts (normalized URL matching, explicit columns, no guessing)
'use server';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import 'server-only';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
});
// Query helper with proper constraint to avoid type errors
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: any[] = []
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params);
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}
/**
 * Normalize an incoming host/url into:
 * - hostOnly: "5004.yatstats.com" (no protocol, no path, no port)
 * - httpsUrl: "https://5004.yatstats.com"
 *
 * Accepts inputs like:
 * - "5004.yatstats.com"
 * - "https://5004.yatstats.com"
 * - "5004.yatstats.com:3000"
 * - "https://5004.yatstats.com/anything?x=y"
 */
function normalizeHostOrUrl(input: string) {
  const raw = (input || '').trim();
  if (!raw) return { hostOnly: '', httpsUrl: '' };
  // Ensure URL parsing works even if protocol missing
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let host = '';
  try {
    const u = new URL(withProto);
    host = (u.hostname || '').toLowerCase();
  } catch {
    // Fallback: strip protocol/path manually
    host = raw
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .split('?')[0]
      .split('#')[0]
      .split(':')[0]
      .toLowerCase();
  }
  const hostOnly = host;
  const httpsUrl = hostOnly ? `https://${hostOnly}` : '';
  return { hostOnly, httpsUrl };
}
// Lookup a school by HSID
export async function getSchoolByHsid(hsid: string) {
  const { rows } = await query<{ id: number; school_name: string; /* add your fields like city: string; state: string; */ }>(
    'SELECT * FROM school_success WHERE hsid = $1 LIMIT 1',
    [hsid]
  );
  return rows[0] || null;
}
/**
 * Lookup a school by its staging or microsite URL.
 * Works whether caller passes:
 * - host only: "5004.yatstats.com"
 * - full url: "https://5004.yatstats.com"
 */
export async function getSchoolByUrl(hostOrUrl: string) {
  const { hostOnly, httpsUrl } = normalizeHostOrUrl(hostOrUrl);
  if (!hostOnly || !httpsUrl) return null;
  // Some callers may store/compare without protocol; include both candidates.
  const candidates = Array.from(new Set([httpsUrl, hostOnly]));
  const sql = `
    SELECT *
    FROM school_success
    WHERE staging_url = ANY($1::text[])
       OR microsite_url = ANY($1::text[])
    LIMIT 1
  `;
  const { rows } = await query(sql, [candidates]);
  return rows[0] || null;
}
/**
 * Canonical roster lookup by HSID
 */
export async function getRosterByHsid(hsid: string): Promise<QueryResultRow[]> {
  const sql = `
    SELECT
      hsid,
      hsname,
      hslocation,
      playerid,
      firstname,
      lastname,
      highlevel,
      high_school,
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', firstname, lastname)), ''),
        NULLIF(playerid::text, '')
      ) AS player_name
    FROM hs_rosters_simple
    WHERE hsid = $1
    ORDER BY lastname NULLS LAST, firstname NULLS LAST, playerid
  `;
  const { rows } = await query(sql, [hsid]);
  return rows;
}
// Lookup a roster by the high_school field (exact match)
export async function getRosterByHighSchool(highSchool: string): Promise<QueryResultRow[]> {
  const sql = `
    SELECT
      hsid,
      hsname,
      hslocation,
      playerid,
      firstname,
      lastname,
      highlevel,
      high_school,
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', firstname, lastname)), ''),
        NULLIF(playerid::text, '')
      ) AS player_name
    FROM hs_rosters_simple
    WHERE high_school = $1
    ORDER BY lastname NULLS LAST, firstname NULLS LAST, playerid
  `;
  const { rows } = await query(sql, [highSchool]);
  return rows;
}
// Graceful shutdown for production (guarded so multiple imports don't register multiple handlers)
declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var __pgPoolShutdownRegistered: any;
}
if (!global.__pgPoolShutdownRegistered) {
  global.__pgPoolShutdownRegistered = true;
  const shutdown = async () => {
    try {
      await pool.end();
    } catch {
      // ignore errors during shutdown
    }
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', async () => {
    await shutdown();
    process.exit(0);
  });
}
