// A school's title partner, shown beside its crest on the opening splash
// (SchoolSplash). Keyed by hsid; a school without one gets its crest alone,
// centered. Logos: a transparent PNG/WebP/SVG that reads on black.
export type TitlePartner = { name: string; logoUrl: string };

const TITLE_PARTNERS: Record<string, TitlePartner> = {
  // '5004': { name: 'Partner name', logoUrl: 'https://yatstats-assets.s3.us-west-2.amazonaws.com/partners/partner.png' },
};

// Previews only (?splash=partner): a placeholder partner, to see the
// side-by-side layout on a school that has none.
export const DEMO_TITLE_PARTNER: TitlePartner = { name: 'Title partner', logoUrl: '/img/splash-partner-demo.svg' };

export function getTitlePartner(hsid: string): TitlePartner | null {
  return TITLE_PARTNERS[hsid] ?? null;
}
