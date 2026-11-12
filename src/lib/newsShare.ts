// Shared short, human-readable News links for every YAT?STATS school.
// The integer key is the existing unique news_articles.id: no new lookup
// table, migration, temporary signed URL, or per-player slug.
const ORIGIN = 'https://yatstats.com';
const UUID = /^[A-Za-z0-9_-]{1,100}$/;
const NEWS_ID = /^[1-9]\d{0,9}$/;
export function isNewsArticleId(value: string): boolean {
  return NEWS_ID.test(value) && Number(value) <= 2147483647;
}

export function newsShareUrl(articleId: number | string | null | undefined, uuid: string): string | null {
  const id = String(articleId ?? '').trim();
  if (isNewsArticleId(id)) return ORIGIN + '/n/' + id;
  return UUID.test(uuid) ? ORIGIN + '/n/' + uuid : null;
}

export function newsShareMessage(title: string, hasVideo: boolean): string {
  const headline = String(title || 'Alumni News').replace(/<[^>]*>/g,' ')
    .replace(/\s+/g,' ').trim().slice(0,135) || 'Alumni News';
  return headline + '\n' + (hasVideo ? 'WATCH THE VIDEO' : 'READ THE STORY') + ' on YAT?STATS';
}
