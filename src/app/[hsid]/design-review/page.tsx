import type { Metadata } from 'next';
import YatDesignReview, { type ReviewScreen } from '@/components/yatstats/YatDesignReview';
import '@/components/yatstats/yat-design-review.css';

export const metadata: Metadata = {
  title: 'YAT?STATS Experience Wireframes | Preview',
  description: 'Approval-only page wireframes and an unpriced partnership rate card.',
};

const ALLOWED = new Set<ReviewScreen>([
  'overview', 'splash', 'galleries', 'news', 'active-profile', 'retired-profile',
  'contribute', 'partner', 'bracket', 'communications',
]);

export default async function DesignReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string }>;
}) {
  const search = await searchParams;
  const raw = String(search?.screen || 'overview');
  const initialScreen: ReviewScreen = ALLOWED.has(raw as ReviewScreen) ? raw as ReviewScreen : 'overview';

  return (
    <section id="sec-design-review" className="yat-section visible">
      <YatDesignReview initialScreen={initialScreen} />
    </section>
  );
}
