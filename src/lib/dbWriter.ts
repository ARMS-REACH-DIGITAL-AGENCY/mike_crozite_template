// src/lib/dbWriter.ts
// The writer connection for ingest jobs (crons that create and fill their
// own tables). The site's pool (src/lib/db.ts, PLAYERS_DATABASE_URL) logs in
// as a read-only role: it may SELECT these tables but not INSERT, UPDATE or
// CREATE in schema public, so an ingest run through it failed on its first
// statement with "permission denied for schema public". DATABASE_URL is the
// same writer the MLB game-log and TBC ingests use.
import 'server-only';
import { Pool, QueryResult, QueryResultRow } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // One cron run at a time; keep the footprint small.
  max: 2,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
});

export async function writerQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: any[] = []
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params);
  } catch (error) {
    console.error('Database writer query error:', error);
    throw error;
  }
}
