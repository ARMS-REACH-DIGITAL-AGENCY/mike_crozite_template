// The bracket's "today": the real date in Arizona (UTC-7 all year, no DST).
// The 2027 season starts Monday Feb 1, 2027 - until then every school's
// bracket is a blank scorecard. ?asof=YYYY-MM-DD still overrides it for
// debugging (see previewDate in gallery.tsx).
export function arizonaToday(now = Date.now()) {
  return new Date(now - 7 * 3600000).toISOString().slice(0, 10);
}

// The bracket's day turns over at 4 a.m. Arizona, not midnight: that's when
// the day before goes final and the next inning starts (see liveSeason.ts).
export function simulationAsOf() {
  return arizonaToday(Date.now() - 4 * 3600000);
}
