import 'server-only';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';

let pool: Pool | undefined;

function configuredUrl(): string {
  const value = process.env.TRIBUNE_DATABASE_URL?.trim();
  try {
    const url = new URL(value || '');
    // Require the complete dedicated credential. An incomplete pg URL could
    // otherwise inherit PGUSER, PGPASSWORD or PGDATABASE from the environment.
    if (['postgres:', 'postgresql:'].includes(url.protocol) && url.hostname &&
        url.username && url.password && url.pathname.length > 1) return value!;
  } catch { /* Configuration failures must not include the credential. */ }
  throw Object.assign(new Error('The private Tribune database is not configured.'), {
    code: 'TRIBUNE_DATABASE_UNCONFIGURED',
  });
}

function privatePool(): Pool {
  // Validate before consulting the cached pool. Never fall back to the player
  // connection, the general writer connection or pg's environment defaults.
  const connectionString = configuredUrl();
  if (!pool) {
    pool = new Pool({
      connectionString,
      application_name: 'yatstats-tribune-server',
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 15000,
      allowExitOnIdle: true,
      maxLifetimeSeconds: 600,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      ssl: { rejectUnauthorized: true },
    });
    // An idle socket error needs a listener, but error messages can contain
    // database details. Deliberately log no SQL, parameters or raw errors.
    pool.on('error', () => console.error('[tribune-db] idle connection lost'));
  }
  return pool;
}

/** Private portal/newsletter operations only; mutations are never retried. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  statement: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return privatePool().query<T>(statement, params);
}
