// The published timeline and its draft proof use the same annual stops.
// Graduation and draft-day milestones are not a whole year's photo slot.
export type CareerYearSlide = { id: string; kind: string; year: number };

const ANNUAL_KINDS = new Set(['lifeyear', 'hsyear', 'coachyear', 'season', 'today', 'future', 'memoryyear']);

export function isCareerYearSlide(slide: CareerYearSlide): boolean {
  return ANNUAL_KINDS.has(slide.kind);
}

export function storyYearSlideIndex(slides: readonly CareerYearSlide[], year: number): number {
  return slides.findIndex((slide) => slide.year === year && isCareerYearSlide(slide));
}

export function withCareerMemoryYears<T extends CareerYearSlide>(
  slides: readonly T[],
  years: Iterable<number>,
  makeMemoryYear: (year: number) => T,
): T[] {
  const annualYears = new Set(slides.filter(isCareerYearSlide).map((slide) => slide.year));
  const missingYears = [...new Set(years)]
    .filter((year) => Number.isInteger(year) && year > 0 && !annualYears.has(year))
    .sort((a, b) => a - b);
  if (!missingYears.length) return [...slides];

  // Merge instead of rebuilding/sorting the existing rows: their same-year
  // HS, graduation, amateur, draft and professional ordering stays intact.
  // A missing annual stop belongs before any milestones of that year.
  const result: T[] = [];
  let nextYear = 0;
  for (const slide of slides) {
    while (nextYear < missingYears.length && missingYears[nextYear] <= slide.year) {
      result.push(makeMemoryYear(missingYears[nextYear++]));
    }
    result.push(slide);
  }
  while (nextYear < missingYears.length) result.push(makeMemoryYear(missingYears[nextYear++]));
  return result;
}
