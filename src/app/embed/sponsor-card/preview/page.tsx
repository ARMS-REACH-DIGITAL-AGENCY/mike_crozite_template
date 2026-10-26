import type { Metadata } from 'next';
import SponsorCardPreview from '@/components/yatstats/SponsorCardPreview';
import YatStyles from '@/components/yatstats/YatStyles';
import { SPONSOR_CARD_TEMPLATES, type SponsorCardTemplate } from '@/lib/partners/sponsorCardTypes';

export const metadata: Metadata = {
  title: 'Sponsor card proof',
  manifest: null,
  robots: { index: false, follow: false },
};

/** Only a fixed example name is accepted; never draft content or asset URLs. */
export default async function SponsorCardPreviewPage({ searchParams }: {
  searchParams: Promise<{ example?: string | string[] }>;
}) {
  const requested = (await searchParams).example;
  const example = typeof requested === 'string' && SPONSOR_CARD_TEMPLATES.includes(requested as SponsorCardTemplate)
    ? requested as SponsorCardTemplate : undefined;
  return <><YatStyles /><SponsorCardPreview key={example || 'private-proof'} example={example} /></>;
}
