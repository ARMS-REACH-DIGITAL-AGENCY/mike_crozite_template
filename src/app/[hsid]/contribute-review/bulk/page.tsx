// <school>.yatstats.com/contribute-review/bulk - bulk photo upload, for
// reviewers (CONTRIBUTE_REVIEWER_EMAILS) only: a spreadsheet of photos for
// players at any school, checked and then posted to the site.
import BulkUpload from './BulkUpload';

export const metadata = { title: 'Bulk photo upload | YAT?STATS', robots: { index: false, follow: false } };

export default function BulkPhotoUploadPage() {
  return (
    <section id="sec-mentor" className="yat-section visible">
      <BulkUpload />
    </section>
  );
}
