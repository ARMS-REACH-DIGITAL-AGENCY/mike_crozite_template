export type ScoutDigestHealth = {
  scans: number;
  post_checks: number;
  ai_reviewed: number;
  failures: number;
  ai_unavailable: number;
  last_run_at: string | null;
  active_roster: number;
  decisions: number;
  ignored: number;
  published: number;
};
export type ScoutHealthState = 'RUNNING' | 'LATE' | 'ERRORS' | 'NO SCANS LOGGED';
export function scoutHealthStatus(health: ScoutDigestHealth, nowMs = Date.now()): ScoutHealthState {
  if (health.scans < 1 || !health.last_run_at) return 'NO SCANS LOGGED';
  const time = Date.parse(health.last_run_at);
  if (!Number.isFinite(time)) return 'NO SCANS LOGGED';
  if (health.failures > 0 || health.ai_unavailable > 0) return 'ERRORS';
  if (nowMs - time > 45 * 60 * 1000) return 'LATE';
  return 'RUNNING';
}
export function autoStoryCount(posted: number, manualBackfills: number): number {
  return Math.max(0, posted - manualBackfills);
}
