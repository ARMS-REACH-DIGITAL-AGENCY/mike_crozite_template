/** Consume only the shared News story selection, preserving every school route. */
export function dismissSchoolNewsStoryParam(currentHref: string): string | null {
  const url = new URL(currentHref);
  if (!url.searchParams.has('story')) return null;
  url.searchParams.delete('story');
  return `${url.pathname}${url.search}${url.hash}`;
}
