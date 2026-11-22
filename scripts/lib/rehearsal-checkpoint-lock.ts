// TEST-ONLY: transaction pooling must retain one backend for the entire run.
import type { Pool } from 'pg';

export async function acquireRehearsalCheckpointLock(
  pool: Pick<Pool, 'connect'>, branch: string, season: string,
): Promise<() => Promise<void>> {
  const client = await pool.connect();
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    let rollbackError: Error | undefined;
    try {
      await client.query('ROLLBACK');
    } catch (error) {
      rollbackError = error instanceof Error ? error : new Error(String(error));
      throw rollbackError;
    } finally {
      // Do not return an uncertain open transaction to the local pool.
      client.release(rollbackError);
    }
  };
  try {
    await client.query('BEGIN');
    const { rows: [lock] } = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_xact_lock(hashtext($1),hashtext($2)) AS acquired', [branch, season]);
    if (!lock?.acquired) throw new Error('Another rehearsal run holds this season checkpoint');
    return release;
  } catch (error) {
    // Keep the acquisition error. A failed rollback already discards the client.
    try { await release(); } catch {}
    throw error;
  }
}
