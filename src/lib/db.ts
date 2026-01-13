// src/lib/db.ts (ultra-minimal, no extras)
'use server';

import { Pool, QueryResult, QueryResultRow } from 'pg';
import 'server-only';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
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

// Lookup a school by HSID
export async function getSchoolByHsid(hsid: string) {
  const { rows } = await query('SELECT * FROM school_success WHERE hsid = $1 LIMIT 1', [hsid]);
  return rows[0] || null;
}

// Lookup a school by its staging or microsite URL (full host)
export async function getSchoolByUrl(host: string) {
  const { rows } = await query(
    'SELECT * FROM school_success WHERE staging_url = $1 OR microsite_url = $1 LIMIT 1',
    [`https://${host}`]
  );
  return rows[0] || null;
}

// Canonical roster lookup by HSID (returns roster rows, with a canonical `name` column)
export async function getRosterByHsid(hsid: string): Promise<QueryResultRow[]> {
  const sql = `
    SELECT
      *,
      COALESCE(
        NULLIF(name, ''),
        NULLIF(TRIM(CONCAT_WS(' ', firstname, lastname)), '')
      ) AS name
    FROM hs_rosters_simple
    WHERE hsid = $1
  `;
  const { rows } = await query(sql, [hsid]);
  return rows;
}

// Lookup a roster by the high_school name
export async function getRosterByHighSchool(highSchool: string): Promise<QueryResultRow[]> {
  const sql = `
    SELECT
      *,
      COALESCE(
        NULLIF(name, ''),
        NULLIF(TRIM(CONCAT_WS(' ', firstname, lastname)), '')
      ) AS name
    FROM hs_rosters_simple
    WHERE high_school = $1
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
    } catch (e) {
      // ignore errors during shutdown
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', async () => {
    await shutdown();
    // keep default behavior for Ctrl+C
    process.exit(0);
  });
}
