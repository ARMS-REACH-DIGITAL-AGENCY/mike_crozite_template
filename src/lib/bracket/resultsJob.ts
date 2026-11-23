import type { Pool } from 'pg';
import {
  bracketDay, checkTeams, runSeason, SQL_SEASONS, type Season,
} from '../../../scripts/master-bracket-results';

export type BracketResultsJobOptions = {
  base: string;
  asof?: string;
  seasonKey?: string;
  region?: number;
  dryRun?: boolean;
  withBox?: boolean;
  effectiveAt?: string;
  request?: typeof fetch;
  teamRequest?: typeof fetch;
};

type JobServices = {
  checkTeams: typeof checkTeams;
  runSeason: typeof runSeason;
};

/**
 * The same server job is used by the scheduled endpoint and an isolated
 * rehearsal. A caller may supply its clock/transport, but cannot skip the
 * production landing and team checks on the ordinary writable path.
 */
export async function runBracketResultsJob(
  pool: Pool,
  options: BracketResultsJobOptions,
  services: JobServices = { checkTeams, runSeason },
) {
  const effective = options.effectiveAt === undefined ? undefined : Date.parse(options.effectiveAt);
  if (effective !== undefined && (!Number.isFinite(effective) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(options.effectiveAt!))) {
    throw new Error('effectiveAt must be an ISO timestamp with an explicit timezone');
  }
  const asof = options.asof || bracketDay(effective);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asof) || !Number.isFinite(Date.parse(asof + 'T00:00:00Z'))) {
    throw new Error('The bracket job requires an explicit valid asof date');
  }
  if (effective !== undefined && bracketDay(effective) !== asof) {
    throw new Error('The bracket job date differs from its effective clock');
  }
  const { region } = options;
  const dryRun = options.dryRun === true;
  const base = options.base.replace(/\/$/, '');
  let relanded: number | null = null;
  if (region == null && !dryRun) {
    const { rows } = await pool.query<{ n: number | string }>('SELECT public.stat_lines_reland_held() AS n');
    relanded = Number(rows[0]?.n || 0);
    // The bracket transport can serve only /api/bracket/live. Team metadata
    // retains its own provider transport and follows this job's season clock.
    await services.checkTeams(pool, { asof, request: options.teamRequest });
  }
  const { rows: seasons } = await pool.query<Season>(SQL_SEASONS, [options.seasonKey || null, asof]);
  const out = [];
  for (const season of seasons) {
    const passes = await services.runSeason(pool, season, asof, {
      base, region, dryRun, withBox: options.withBox,
      effectiveAt: options.effectiveAt, request: options.request,
    });
    out.push({ season: season.season_key, passes });
  }
  return { asof, region: region ?? null, base, dryRun, relanded, seasons: out };
}
