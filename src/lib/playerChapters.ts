// A person with two schools: one card, one chapter per school (CLAUDE.md
// "A person with two schools"; Pete, Nov 18-19 2026).
//
// Same everywhere: name, photos, stats, news, stories, social, connect and
// one career timeline. Per school chapter: the school (logo and name), the
// front's status, level and team, and the back's first tab.
//
// The status rule (Pete, Nov 19 2026): only a COACH's other school switches.
// On the school he coaches, and for everyone else on every school, the
// chapter shows his current status, level and team. On a school a coach
// played for that is not his current team: RETIRED, his HIGHEST level, no
// team. Never another status (never "ALUMNUS").
//
// Chapters come from his card (current team) and his school links
// (yat_school_links, which player_hsids reads); nothing is set by hand.

export type PlayerChapterSchool = { hsid: string; schoolName: string; location: string };

export type PlayerChapterSource = {
  yatid: string;
  homeHsid: string;
  statusLabel: string;
  levelLabel: string;
  highestLevelLabel: string;
  teamName: string;
  teamId: string;
  orgName: string;
  schools: PlayerChapterSchool[];
};

export type PlayerChapter = {
  hsid: string;
  schoolName: string;
  location: string;
  /** His current team's school (where his card lives). */
  current: boolean;
  statusLabel: string;
  levelLabel: string;
  teamName: string;
  teamId: string;
  orgName: string;
};

const text = (value: unknown) => String(value ?? '').trim();

export function isCoachStatus(value: unknown): boolean {
  return /^COACH\b/.test(text(value).toUpperCase());
}

/** One chapter per school, in a stable order: his current school first. */
export function buildPlayerChapters(source: PlayerChapterSource): PlayerChapter[] {
  const home = text(source.homeHsid);
  const coach = isCoachStatus(source.statusLabel);
  const seen = new Set<string>();
  const chapters: PlayerChapter[] = [];
  for (const school of source.schools) {
    const hsid = text(school.hsid);
    if (!hsid || seen.has(hsid)) continue;
    seen.add(hsid);
    const current = hsid === home;
    const retiredChapter = !current && coach;
    chapters.push({
      hsid,
      schoolName: text(school.schoolName),
      location: text(school.location),
      current,
      statusLabel: retiredChapter ? 'RETIRED' : text(source.statusLabel),
      levelLabel: retiredChapter ? text(source.highestLevelLabel) : text(source.levelLabel),
      teamName: retiredChapter ? '' : text(source.teamName),
      teamId: retiredChapter ? '' : text(source.teamId),
      orgName: retiredChapter ? '' : text(source.orgName),
    });
  }
  return chapters.sort((a, b) => Number(b.current) - Number(a.current));
}

/**
 * Which chapter shows first: on a school page (or under a school's address)
 * that school's; anywhere else (search, favorites) his current status.
 */
export function defaultChapterIndex(chapters: PlayerChapter[], pageHsid?: unknown): number {
  const hsid = text(pageHsid);
  const onSchool = hsid ? chapters.findIndex((c) => c.hsid === hsid) : -1;
  if (onSchool >= 0) return onSchool;
  const current = chapters.findIndex((c) => c.current);
  return current >= 0 ? current : 0;
}

/**
 * The card fields a chapter decides, for a row shown on a school page. Every
 * other field (name, photos, stats, ...) stays the person's own.
 */
export function chapterCardFields(chapter: PlayerChapter): Record<string, string | null> {
  return {
    hsid: chapter.hsid,
    status_label: chapter.statusLabel,
    display_status_label: chapter.statusLabel,
    level_label: chapter.levelLabel,
    display_level_label: chapter.levelLabel,
    current_team_name: chapter.teamName || null,
    current_teamid: chapter.teamId || null,
    current_org_or_conference_name: chapter.orgName || null,
  };
}
