import type { Metadata } from 'next';
import YatDesignReview from '@/components/yatstats/YatDesignReview';
import '@/components/yatstats/yat-design-review.css';

export const metadata: Metadata = {
  title: 'YAT?STATS Partnership Program Rate Card | Wireframe',
  description: 'Five advertising packages, planned placements, and blank prices for review.',
};

export default function PartnerProgramWireframePage() {
  return (
    <section id="sec-partner" className="yat-section visible">
      <YatDesignReview initialScreen="partner" />
    </section>
  );
}
