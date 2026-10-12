// src/lib/teamCards.ts
// Team cards: the baseball cards made for a school's state-champion teams
// (assets/team-cards/{hsid}/, uploaded to S3 by the "Upload team cards"
// workflow). Each card is on the head coach's Career Path Timeline as a
// YAT?STATS memory for its year, and is the share preview for that team.

const S3 = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';

// The seasons with a card, by school.
export const TEAM_CARD_YEARS: Record<string, readonly number[]> = {
  '5004': [2003, 2004, 2008, 2014, 2016, 2017, 2019, 2022, 2023, 2026],
};

export function hasTeamCard(hsid: string, year: string | number): boolean {
  return Boolean(TEAM_CARD_YEARS[String(hsid)]?.includes(Number(year)));
}

export function teamCardKeys(hsid: string, year: string | number) {
  const stem = `team-cards/${hsid}/${year}`;
  return { full: `${stem}.jpg`, web: `${stem}-web.webp`, thumb: `${stem}-thumb.webp`, og: `${stem}-og.jpg` };
}

// The 1200x630 share preview (the whole card on a blurred backdrop).
export function teamCardShareImage(hsid: string, year: string | number): string | null {
  return hasTeamCard(hsid, year) ? `${S3}/${teamCardKeys(hsid, year).og}` : null;
}
