import type { NextRequest } from 'next/server';
import { Pool } from 'pg';

type PitchingParams = { hsid: string };

// Reuse the pool across hot reloads / serverless invocations where possible.
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  if (!globalThis.__pgPool) {
    globalThis.__pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      // optional hardening defaults:
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  return globalThis.__pgPool;
}

/**
 * Next.js 16 route handlers type `context.params` as a Promise.
 * This signature matches that exactly (no RouteContext import needed).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<PitchingParams> }
): Promise<Response> {
  const { hsid } = await context.params;

  if (!hsid || typeof hsid !== 'string') {
    return Response.json({ error: 'Missing or invalid hsid' }, { status: 400 });
  }

  try {
    const pool = getPool();

    // NOTE: If your join keys differ, update ONLY the ON clause.
    const query = `
      SELECT p.*
      FROM tbc_pitching_raw p
      JOIN tbc_players_raw pl ON p.playerid = pl.playerid
      WHERE pl.hsid = $1
    `;

    const result = await pool.query(query, [hsid]);
    return Response.json(result.rows, {
      status: 200,
      headers: {
        // helpful defaults
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[pitching/[hsid]] GET failed:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
