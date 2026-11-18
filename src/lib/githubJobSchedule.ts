// Pete, Nov 18 2026: GitHub ran our scheduled workflows only every 7-10 hours
// whatever their cron said (e.g. MLB transactions "every 15 min" ran Nov 17
// 00:50, 08:59, 18:28, Nov 18 01:15 UTC), while runs started by hand began at
// once. Vercel Cron now keeps the time: /api/cron/github-jobs runs every 5
// minutes and starts (workflow_dispatch) each workflow below that is due.
//
// Keep each schedule identical to the workflow file's own `cron:` line (UTC).
// scripts/test-github-job-schedule.cjs fails the build if they drift apart.

export type GithubJob = { workflow: string; cron: string[] };

export const GITHUB_JOBS: GithubJob[] = [
  { workflow: "mlb-transactions-sync.yml", cron: ["*/15 * * * *"] },
  { workflow: "mlb-live-schedule-refresh.yml", cron: ["*/10 * * * *"] },
  { workflow: "mlb_roster-sync.yml", cron: ["0 */3 * * *"] },
  { workflow: "hourly-player-image-cutouts.yml", cron: ["7,37 * * * *", "41 10 * * *"] },
  { workflow: "mlb-player-gamelogs-sync.yml", cron: ["20 */4 * * *"] },
  { workflow: "build-player-team-stints.yml", cron: ["50 */4 * * *"] },
  { workflow: "mlb-schedule-sync.yml", cron: ["0 9 * * *"] },
  { workflow: "tbc-players-audit-capture.yml", cron: ["30 10,22 * * *"] },
  { workflow: "audit-career-team-logos.yml", cron: ["15 10 * * *"] },
  { workflow: "import-player-draft-picks.yml", cron: ["40 10 * * 1"] },
  { workflow: "build-web-cutouts.yml", cron: ["53 11 * * *"] },
  { workflow: "sync-mlb-person-profiles.yml", cron: ["10 12 * * *"] },
  { workflow: "import-region1-college-schedules.yml", cron: ["15 12 * * *"] },
  { workflow: "ingest-news.yml", cron: ["47 12 * * *"] },
  { workflow: "audit-mlb-player-links.yml", cron: ["40 13 * * *"] },
  { workflow: "import-mlb-headshots.yml", cron: ["25 14 * * *"] },
];

// The Vercel cron that calls the route runs every WINDOW_MINUTES minutes.
export const WINDOW_MINUTES = 5;

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  return field.split(",").some((part) => {
    const [range, stepText] = part.split("/");
    const step = stepText ? Number(stepText) : 1;
    let lo = min;
    let hi = max;
    if (range !== "*") {
      const [a, b] = range.split("-");
      lo = Number(a);
      hi = b !== undefined ? Number(b) : stepText ? max : lo;
    }
    return value >= lo && value <= hi && (value - lo) % step === 0;
  });
}

// Standard 5-field cron (minute hour day-of-month month day-of-week), UTC.
export function cronMatches(cron: string, at: Date): boolean {
  const [mi, ho, dom, mo, dow] = cron.trim().split(/\s+/);
  return (
    fieldMatches(mi, at.getUTCMinutes(), 0, 59) &&
    fieldMatches(ho, at.getUTCHours(), 0, 23) &&
    fieldMatches(dom, at.getUTCDate(), 1, 31) &&
    fieldMatches(mo, at.getUTCMonth() + 1, 1, 12) &&
    fieldMatches(dow, at.getUTCDay(), 0, 6)
  );
}

// Workflows with a scheduled minute inside the 5-minute slot that `now` falls
// in (e.g. 05:05-05:09 for any call between 05:05:00 and 05:09:59). Anchoring
// to the slot means a late Vercel call still covers its own slot, and the
// slots never overlap, so a job is started once per scheduled time. A job
// can start up to 4 minutes before its listed minute.
export function dueJobs(now: Date, jobs: GithubJob[] = GITHUB_JOBS): string[] {
  const slotStart = new Date(now);
  slotStart.setUTCSeconds(0, 0);
  slotStart.setUTCMinutes(slotStart.getUTCMinutes() - (slotStart.getUTCMinutes() % WINDOW_MINUTES));
  const due: string[] = [];
  for (const job of jobs) {
    for (let step = 0; step < WINDOW_MINUTES; step++) {
      const at = new Date(slotStart.getTime() + step * 60_000);
      if (job.cron.some((c) => cronMatches(c, at))) {
        due.push(job.workflow);
        break;
      }
    }
  }
  return due;
}
