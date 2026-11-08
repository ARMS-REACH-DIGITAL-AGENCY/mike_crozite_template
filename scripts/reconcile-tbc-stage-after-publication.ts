#!/usr/bin/env node
/**
 * Finish the TBC Players publication cycle by reconciling 2026 college teams
 * using the same safe canonical SQL as the existing daily quality-control job.
 * Must not overwrite independently verified current MLB, fan, or override data.
 */
import { Pool } from 'pg';
import {
  SAFE_2026_STAGE_TEAM_RECOVERY_SQL,
  SAFE_2026_BLANK_STATUS_RECOVERY_SQL,
} from '../src/lib/officialLevels';

async function main() {
  if (new Date().getUTCFullYear() !== 2026) {
    throw new Error('2026 source recovery disabled after season rollover');
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 30_000,
    statement_timeout: 90_000,
  });
  try {
    const activity = await pool.query(SAFE_2026_BLANK_STATUS_RECOVERY_SQL);
    const team = await pool.query(SAFE_2026_STAGE_TEAM_RECOVERY_SQL);
    console.log(JSON.stringify({
      operation: 'tbc_2026_verified_stage_reconciliation',
      activitiesReactivated: Number(activity.rows[0]?.activated ?? 0),
      collegeTeamsRecovered: Number(team.rows[0]?.recovered ?? 0),
      status: 'complete',
    }));
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('[tbc-stage-reconciliation] FAILED', error);
  process.exitCode = 1;
});
