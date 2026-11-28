// TEST-ONLY: an interrupted day must never rewind a persisted cutoff.
export type RehearsalResumeMode = 'ingest' | 'cutoff' | 'published';
export type RehearsalResumeCheckpoint = {
  report_date: string; branch_id: string; effective_at: string; phase: string;
};
export type ReadyPeriod = {
  cadence: string; period_start: string; period_end: string; season_key: string; cutoff_at: string;
};

export function rehearsalResumeMode(input: {
  day: string; cutoffAt: string; season: string; branch: string;
  periods: Array<{ cadence: string; date: string }>;
  ready: ReadyPeriod[];
  checkpoint?: RehearsalResumeCheckpoint;
  cutoffWrites: number; missingBoundary: number;
}): RehearsalResumeMode {
  const { checkpoint, day, cutoffAt } = input;
  const sameDay = checkpoint?.report_date === day;
  if (sameDay && (checkpoint.branch_id !== input.branch || Date.parse(checkpoint.effective_at) !== Date.parse(cutoffAt)
      || !['ingesting', 'running', 'scored', 'awaiting_review'].includes(checkpoint.phase))) {
    throw new Error('The saved rehearsal day has a different branch, clock or phase');
  }
  for (const row of input.ready) {
    if (!input.periods.some(period => row.cadence === period.cadence && row.period_start === period.date)
        || row.season_key !== input.season || row.period_end !== day
        || Date.parse(row.cutoff_at) !== Date.parse(cutoffAt)) {
      throw new Error('A saved publication does not match this rehearsal day and cutoff');
    }
  }
  const allReady = input.periods.every(period => input.ready.some(row => row.cadence === period.cadence && row.period_start === period.date));
  if (allReady || input.cutoffWrites > 0 || input.ready.length) {
    if (!sameDay || !['running', 'scored', 'awaiting_review'].includes(checkpoint.phase)) {
      throw new Error('A persisted cutoff requires the matching running or scored rehearsal checkpoint');
    }
    if (allReady && (input.cutoffWrites < 1 || input.missingBoundary > 0)) {
      throw new Error('Published rehearsal results are no longer at their saved cutoff');
    }
    if (input.ready.length && input.cutoffWrites < 1) {
      throw new Error('A partial publication has no matching persisted cutoff');
    }
    return allReady ? 'published' : 'cutoff';
  }
  if (sameDay && ['scored', 'awaiting_review'].includes(checkpoint.phase)) {
    throw new Error('The saved completed rehearsal phase has no matching cutoff');
  }
  return 'ingest';
}

/** Keep retry decisions and the effects they permit together. */
export async function runRehearsalStages<T>(mode: RehearsalResumeMode, work: {
  ingest: () => Promise<void>;
  prelock: () => Promise<void>;
  publish: () => Promise<T>;
}): Promise<T> {
  if (mode === 'ingest') {
    await work.ingest();
    await work.prelock();
  }
  return work.publish();
}
