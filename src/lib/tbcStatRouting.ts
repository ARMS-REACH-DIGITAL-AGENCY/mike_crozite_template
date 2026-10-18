/**
 * Route supplied TBC seasons without replacing established historical stats.
 * The caller owns BEGIN/COMMIT/ROLLBACK. Transaction-scoped locks serialize
 * additive archive writes because these raw tables have no unique key index.
 */
export const TBC_CURRENT_STAT_SEASON = 2026;

export type StatRoutingClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
};

export type StatInspection = {
  sourceRows: number;
  seasonCounts: Record<string, number>;
  invalidRows: number;
  invalidYearRows: number;
  invalidCurrentIdentityRows: number;
  unresolvedCurrentTeamRows: number;
  futureRows: number;
  unsafeNonCurrentRows: number;
  currentRows: number;
  currentUniqueRows: number;
  conflictingCurrentKeys: number;
  conflictingCurrentRows: number;
  exactDuplicateCurrentRows: number;
};

export type HistoricalArchiveResult = {
  historicalRows: number;
  distinctRows: number;
  insertedRows: number;
  existingRows: number;
  duplicateKeys: number;
  conflictingExistingRows: number;
  heldRows: number;
  examples: Array<{ playerid: string; teamid: string; year: number; reason: string }>;
};

export type TbcStatRoutingResult = {
  state: 'healthy' | 'degraded';
  currentSeason: number;
  seasonCounts: Record<string, number>;
  invalidRows: number;
  unresolvedCurrentTeamRows: number;
  skippedCsvRows: number;
  futureRows: number;
  conflictingCurrentKeys: number;
  conflictingCurrentRows: number;
  exactDuplicateCurrentRows: number;
  currentReplacement: 'replaced' | 'held';
  holdReasons: string[];
  currentRowsWritten: number;
  currentRowsRetained: number;
  targetRows: number;
  previousCurrentArchive: HistoricalArchiveResult;
  feedArchive: HistoricalArchiveResult;
};

type SourceSqlOptions = { sourceTable: string; columns: string[]; currentSeason?: number };

function ident(value: string): string {
  if (!value || value.includes('\0')) throw new Error('Invalid SQL identifier');
  return `"${value.replace(/"/g, '""')}"`;
}

function table(value: string): string {
  const parts = value.split('.');
  if (parts.length !== 2 || parts.some((part) => !part)) throw new Error('Expected a schema-qualified statistics table');
  return parts.map(ident).join('.');
}

function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function season(value = TBC_CURRENT_STAT_SEASON): number {
  if (!Number.isInteger(value) || value < 1801 || value > 9999) throw new Error('Invalid current statistics season');
  return value;
}

function requireKeyColumns(columns: string[]): void {
  if (new Set(columns).size !== columns.length || !['playerid', 'teamid', 'year'].every((key) => columns.includes(key))) {
    throw new Error('Statistics routing requires distinct playerid, teamid, and year columns');
  }
  columns.forEach(ident);
}

// Accept an integer year, including an exact decimal representation such as
// 2025.0. Fractional years, ranges, missing years and years before 1800 are held.
function parsedYear(alias: string): string {
  const value = `btrim(${alias}."year"::text)`;
  return `CASE WHEN ${value} ~ '^[0-9]{4}([.]0+)?$' THEN CASE WHEN left(${value},4)::int >= 1800 THEN left(${value},4)::int END END`;
}

function sourceCte(name: string, sourceTable: string, columns: string[]): string {
  requireKeyColumns(columns);
  const year = parsedYear('source_record');
  const projection = columns.map((column) => column === 'year'
    ? `(${year})::text AS ${ident(column)}`
    : `nullif(btrim(source_record.${ident(column)}::text),'') AS ${ident(column)}`).join(',\n        ');
  return `${name} AS MATERIALIZED (
    SELECT projected.playerid, projected.teamid, (${year}) AS season,
      coalesce(projected.playerid ~ '^[1-9][0-9]*$',false)
        AND coalesce(projected.teamid ~ '^[1-9][0-9]*$',false) AS valid_identity,
      coalesce(projected.playerid ~ '^[1-9][0-9]*$',false)
        AND coalesce(projected.teamid ~ '^(0|[1-9][0-9]*)$',false) AS valid_current_identity,
      to_jsonb(projected) AS payload
    FROM ${table(sourceTable)} source_record
    CROSS JOIN LATERAL (SELECT ${projection}) projected
  )`;
}

function currentCtes(options: SourceSqlOptions): string {
  const year = season(options.currentSeason);
  return `${sourceCte('source_rows', options.sourceTable, options.columns)},
  current_rows AS MATERIALIZED (
    SELECT * FROM source_rows WHERE valid_current_identity AND season=${year}
  ), current_keys AS MATERIALIZED (
    SELECT playerid,teamid,season,count(*)::int AS rows,count(DISTINCT payload)::int AS variants
    FROM current_rows GROUP BY playerid,teamid,season
  )`;
}

export function buildTbcStatInspectionSql(options: SourceSqlOptions): string {
  const year = season(options.currentSeason);
  return `WITH ${currentCtes(options)}
  SELECT count(*)::int AS "sourceRows",
    coalesce((SELECT jsonb_object_agg(season::text,n) FROM
      (SELECT season,count(*)::int AS n FROM source_rows WHERE season IS NOT NULL GROUP BY season) years),'{}'::jsonb) AS "seasonCounts",
    count(*) FILTER (WHERE season IS NULL OR NOT CASE WHEN season=${year} THEN valid_current_identity ELSE valid_identity END)::int AS "invalidRows",
    count(*) FILTER (WHERE season IS NULL)::int AS "invalidYearRows",
    count(*) FILTER (WHERE season=${year} AND NOT valid_current_identity)::int AS "invalidCurrentIdentityRows",
    count(*) FILTER (WHERE season=${year} AND valid_current_identity AND teamid='0')::int AS "unresolvedCurrentTeamRows",
    count(*) FILTER (WHERE season>${year})::int AS "futureRows",
    count(*) FILTER (WHERE season IS NULL OR season>${year} OR (season<${year} AND NOT valid_identity))::int AS "unsafeNonCurrentRows",
    (SELECT count(*)::int FROM current_rows) AS "currentRows",
    (SELECT count(*)::int FROM current_keys WHERE variants=1) AS "currentUniqueRows",
    (SELECT count(*)::int FROM current_keys WHERE variants>1) AS "conflictingCurrentKeys",
    (SELECT coalesce(sum(rows),0)::int FROM current_keys WHERE variants>1) AS "conflictingCurrentRows",
    (SELECT coalesce(sum(rows-1),0)::int FROM current_keys WHERE variants=1) AS "exactDuplicateCurrentRows"
  FROM source_rows`;
}

export function buildTbcHistoricalArchiveSql(options: SourceSqlOptions & { historicalTable: string }): string {
  const year = season(options.currentSeason);
  const columns = options.columns.map(ident).join(', ');
  const values = options.columns.map((column) => `c.payload->>${literal(column)}`).join(', ');
  return `WITH ${sourceCte('source_rows', options.sourceTable, options.columns)},
  ${sourceCte('history_rows', options.historicalTable, options.columns)},
  candidates AS MATERIALIZED (
    SELECT DISTINCT playerid,teamid,season,payload FROM source_rows WHERE valid_identity AND season<${year}
  ), candidate_keys AS MATERIALIZED (
    SELECT playerid,teamid,season,count(*)::int AS variants FROM candidates GROUP BY playerid,teamid,season
  ), classified AS MATERIALIZED (
    SELECT c.*,k.variants,
      EXISTS (SELECT 1 FROM history_rows h WHERE h.playerid=c.playerid AND h.teamid=c.teamid AND h.season=c.season) AS existing_key,
      EXISTS (SELECT 1 FROM history_rows h WHERE h.playerid=c.playerid AND h.teamid=c.teamid AND h.season=c.season AND h.payload=c.payload) AS existing_row
    FROM candidates c JOIN candidate_keys k USING(playerid,teamid,season)
  ), inserted AS (
    INSERT INTO ${table(options.historicalTable)} (${columns})
    SELECT ${values} FROM classified c WHERE c.variants=1 AND NOT c.existing_key
    RETURNING 1
  )
  SELECT (SELECT count(*)::int FROM source_rows WHERE valid_identity AND season<${year}) AS "historicalRows",
    (SELECT count(*)::int FROM candidates) AS "distinctRows",
    (SELECT count(*)::int FROM inserted) AS "insertedRows",
    (SELECT count(*)::int FROM classified WHERE variants=1 AND existing_row) AS "existingRows",
    (SELECT count(*)::int FROM candidate_keys WHERE variants>1) AS "duplicateKeys",
    (SELECT count(*)::int FROM classified WHERE variants=1 AND existing_key AND NOT existing_row) AS "conflictingExistingRows",
    (SELECT count(*)::int FROM classified WHERE variants>1 OR (existing_key AND NOT existing_row)) AS "heldRows",
    coalesce((SELECT jsonb_agg(x) FROM (SELECT playerid,teamid,season AS year,
      CASE WHEN variants>1 THEN 'conflicting_source_rows' ELSE 'existing_history_differs' END AS reason
      FROM classified WHERE variants>1 OR (existing_key AND NOT existing_row)
      ORDER BY playerid,teamid,season LIMIT 10) x),'[]'::jsonb) AS examples`;
}

/** Keep every current row and stat value; canonicalize only its season key.
 * TBC supplies legitimate current rows with teamid=0. Preserve that source
 * sentinel, but never use it as a team identity for historical promotion.
 */
export function buildTbcCurrentSeasonSql(options: SourceSqlOptions & { currentTable: string }): { remove: string; insert: string } {
  requireKeyColumns(options.columns);
  const year = season(options.currentSeason);
  const columns = options.columns.map(ident).join(', ');
  const values = options.columns.map((column) => column === 'year'
    ? `${literal(String(year))}` : `source_record.${ident(column)}`).join(', ');
  return {
    remove: `TRUNCATE TABLE ${table(options.currentTable)}`,
    insert: `INSERT INTO ${table(options.currentTable)} (${columns})
      SELECT ${values} FROM ${table(options.sourceTable)} source_record
      WHERE (${parsedYear('source_record')})=${year}
        AND btrim(source_record.playerid::text) ~ '^[1-9][0-9]*$'
        AND btrim(source_record.teamid::text) ~ '^(0|[1-9][0-9]*)$'`,
  };
}

async function getColumns(client: StatRoutingClient, qualifiedTable: string): Promise<string[]> {
  table(qualifiedTable);
  const [schema, name] = qualifiedTable.split('.');
  const result = await client.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`, [schema, name]);
  const columns = result.rows.map((row) => String(row.column_name));
  requireKeyColumns(columns);
  return columns;
}

async function countRows(client: StatRoutingClient, qualifiedTable: string): Promise<number> {
  const result = await client.query(`SELECT count(*)::int AS count FROM ${table(qualifiedTable)}`);
  return Number(result.rows[0]?.count || 0);
}

export async function routeTbcStatFeed(client: StatRoutingClient, options: {
  landingTable: string; currentTable: string; historicalTable: string; landingColumns: string[]; currentSeason?: number; skippedRows?: number;
}): Promise<TbcStatRoutingResult> {
  const year = season(options.currentSeason);
  const skippedCsvRows = options.skippedRows || 0;
  if (!Number.isInteger(skippedCsvRows) || skippedCsvRows < 0) throw new Error('Invalid skipped statistics row count');
  requireKeyColumns(options.landingColumns);
  const currentColumns = await getColumns(client, options.currentTable);
  const historicalColumns = await getColumns(client, options.historicalTable);
  const landingCurrentColumns = currentColumns.filter((column) => options.landingColumns.includes(column));
  const landingHistoricalColumns = historicalColumns.filter((column) => options.landingColumns.includes(column));
  const oldHistoricalColumns = historicalColumns.filter((column) => currentColumns.includes(column));
  [landingCurrentColumns, landingHistoricalColumns, oldHistoricalColumns].forEach(requireKeyColumns);
  // LOCK fails outside a transaction block, before any archive/current write.
  await client.query(`LOCK TABLE ${[options.historicalTable, options.currentTable, options.landingTable].map(table).join(', ')} IN SHARE ROW EXCLUSIVE MODE`);
  const inspect = async (sourceTable: string, columns: string[]) => {
    const result = await client.query(buildTbcStatInspectionSql({ sourceTable, columns, currentSeason: year }));
    if (!result.rows[0]) throw new Error('Statistics inspection returned no result');
    return result.rows[0] as unknown as StatInspection;
  };
  const archive = async (sourceTable: string, columns: string[]) => {
    const result = await client.query(buildTbcHistoricalArchiveSql({ sourceTable, columns, historicalTable: options.historicalTable, currentSeason: year }));
    if (!result.rows[0]) throw new Error('Historical statistics archival returned no result');
    return result.rows[0] as unknown as HistoricalArchiveResult;
  };
  const incoming = await inspect(options.landingTable, landingCurrentColumns);
  const previous = await inspect(options.currentTable, currentColumns);
  // Preserve formerly misrouted seasons before considering current replacement.
  const previousCurrentArchive = await archive(options.currentTable, oldHistoricalColumns);
  const feedArchive = await archive(options.landingTable, landingHistoricalColumns);
  const holdReasons: string[] = [];
  if (skippedCsvRows) holdReasons.push('malformed_csv_rows');
  if (!incoming.currentRows) holdReasons.push('no_current_season_rows');
  if (incoming.invalidYearRows || incoming.invalidCurrentIdentityRows) holdReasons.push('invalid_current_season_or_year');
  if (previous.unsafeNonCurrentRows) holdReasons.push('unroutable_existing_noncurrent_rows');
  if (previousCurrentArchive.heldRows) holdReasons.push('unpreserved_existing_historical_rows');
  let currentRowsWritten = 0;
  if (!holdReasons.length) {
    const sql = buildTbcCurrentSeasonSql({ sourceTable: options.landingTable, currentTable: options.currentTable,
      columns: landingCurrentColumns, currentSeason: year });
    await client.query(sql.remove);
    await client.query(sql.insert);
    currentRowsWritten = incoming.currentRows;
  }
  const targetRows = await countRows(client, options.currentTable);
  if (!holdReasons.length && targetRows !== currentRowsWritten) {
    throw new Error('Current-season statistics count did not match the reviewed routing plan');
  }
  return {
    state: holdReasons.length || incoming.invalidRows || incoming.unresolvedCurrentTeamRows || incoming.futureRows || incoming.conflictingCurrentKeys || feedArchive.heldRows
      ? 'degraded' : 'healthy',
    currentSeason: year, seasonCounts: incoming.seasonCounts,
    invalidRows: incoming.invalidRows, skippedCsvRows, futureRows: incoming.futureRows,
    unresolvedCurrentTeamRows: incoming.unresolvedCurrentTeamRows,
    conflictingCurrentKeys: incoming.conflictingCurrentKeys, conflictingCurrentRows: incoming.conflictingCurrentRows,
    exactDuplicateCurrentRows: incoming.exactDuplicateCurrentRows,
    currentReplacement: holdReasons.length ? 'held' : 'replaced', holdReasons,
    currentRowsWritten, currentRowsRetained: holdReasons.length ? targetRows : 0,
    targetRows, previousCurrentArchive, feedArchive,
  };
}
