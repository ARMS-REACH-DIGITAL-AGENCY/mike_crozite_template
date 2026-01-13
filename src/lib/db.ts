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

// Lookup a roster by HSID
export async function getRosterByHsid(hsid: string) {
  const { rows } = await query('SELECT * FROM hs_rosters_simple WHERE hsid = $1', [hsid]);
  return rows;
}

// Lookup a school by its staging or microsite URL (full host)
export async function getSchoolByUrl(host: string) {
  const { rows } = await query(
    'SELECT * FROM school_success WHERE staging_url = $1 OR microsite_url = $1 LIMIT 1',
    [`https://${host}`]
  );
  return rows[0] || null;
}

// Lookup a roster by the high_school name
export async function getRosterByHsid(hsid: string) {
  const sql = `
    SELECT
      *,
      COALESCE(NULLIF(name,''), 
        NULLIF(TRIM(CONCAT_WS(' ', firstname, lastname)), '')
      ) AS name
    FROM hs_rosters_simple
    WHERE hsid = $1
  `;
  const { rows } = await query(sql, [hsid]);
  return rows;
}

export async function getRosterByHighSchool(highSchool: string) {
  const sql = `
    SELECT
      *,
      COALESCE(NULLIF(name,''), 
        NULLIF(TRIM(CONCAT_WS(' ', firstname, lastname)), '')
      ) AS name
    FROM hs_rosters_simple
    WHERE high_school = $1
  `;
  const { rows } = await query(sql, [highSchool]);
  return rows;
}

// Graceful shutdown for production
process.on('SIGTERM', async () => {
  await pool.end();
});
