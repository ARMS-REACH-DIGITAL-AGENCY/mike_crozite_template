// src/lib/db.ts (ultra-minimal, no extras)
'use server'; // Optional but recommended for App Router server files

import { Pool, QueryResult, QueryResultRow } from 'pg';
import 'server-only'; // Ensures this can't be imported into client components

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Production-safe: limit connections to avoid overload
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined, // Handle SSL for Vercel/Postgres
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
// Implementations - minimal SQL and types
export async function getSchoolByHsid(hsid: string) {
  const { rows } = await query(
    'SELECT * FROM school_success WHERE hsid = $1 LIMIT 1',
    [hsid]
  );
  return rows[0] || null;
}

export async function getRosterByHsid(hsid: string) {
  const { rows } = await query(
    'SELECT * FROM hs_rosters_simple WHERE hsid = $1',
    [hsid]
  );
  return rows;
}

export async function getSchoolByUrl(host: string) {
  const { rows } = await query(
    'SELECT * FROM school_success WHERE staging_url = $1 OR microsite_url = $1 LIMIT 1',
    [`https://${host}`]
  );
  return rows[0] || null;
}

export async function getRosterByHighSchool(highSchool: string) {
  const { rows } = await query(
    'SELECT * FROM hs_rosters_simple WHERE high_school = $1',
    [highSchool]
  );
  return rows;
}
// Implementations - minimal SQL and types
export async function getSchoolByHsid(hsid: string) {
  const { rows } = await query(

export async function getSchoolByUrl(host: string) {
  const { rows } = await query(
    'SELECT * FROM school_success WHERE staging_url = $1 OR microsite_url = $1 LIMIT 1',
    [`https://${host}`]
  );
  return rows[0] || null;
}

export async function getRosterByHighSchool(highSchool: string) {
  const { rows } = await query(
    'SELECT * FROM hs_rosters_simple WHERE high_school = $1',
    [highSchool]
  );
  return rows;
}
    'SELECT * FROM school_success WHERE hsid = $1 LIMIT 1',
    [hsid]
  );
  return rows[0] || null;
}

export async function getRosterByHsid(hsid: string) {
  const { rows } = await query(
    'SELECT * FROM hs_rosters_simple WHERE hsid = $1',
    [hsid]
  );
  return rows;
}

// Graceful shutdown for production
process.on('SIGTERM', async () => {
  await pool.end();
});
