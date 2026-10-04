import { redirect } from 'next/navigation';

// <school>.yatstats.com/connect-contribute/ - the Connect & Contribute
// Portal lives in the school page's #sec-mentor section (the same place the
// topbar and drawer links go). On a school subdomain the middleware rewrites
// this path to /<school>/connect-contribute, so the school home is "/";
// on a bare /<hsid>/ path (previews) it is "/<hsid>".
export default async function ConnectContributePage({ params }: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await params;
  redirect(/^\d+$/.test(hsid) ? `/${encodeURIComponent(hsid)}#sec-mentor` : '/#sec-mentor');
}
