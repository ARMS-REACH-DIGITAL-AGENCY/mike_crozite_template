// <school>.yatstats.com/contribute-review - the Connect & Contribute review
// queue: the photos the automatic check (Claude) wasn't sure about, plus
// corrections, tips and missing players. Only reviewers
// (CONTRIBUTE_REVIEWER_EMAILS) get any data; everyone else sees "this page
// is for YAT?STATS reviewers".
import ReviewQueue from './ReviewQueue';

export const metadata = { title: 'Contribution review | YAT?STATS', robots: { index: false, follow: false } };

export default function ContributeReviewPage() {
  return (
    <section id="sec-mentor" className="yat-section visible">
      <ReviewQueue />
    </section>
  );
}
