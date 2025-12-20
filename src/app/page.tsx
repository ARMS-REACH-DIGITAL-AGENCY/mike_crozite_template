/*
 * Dynamic high school page for microsites
 *
 * This server component renders data for a specific high school based
 * on its HSID, which is extracted from the subdomain by the
 * `middleware.ts` at the project root.  The page fetches data from
 * internal API endpoints—players, batting, pitching, and school
 * metadata—and displays them in a simple HTML layout.  When creating
 * more elaborate pages later, you can replace the JSON dumps with
 * charts or tables.  For now, this page demonstrates how to load
 * dynamic data and confirms that the routing logic is working.
 */

import type { Metadata } from 'next';

interface PageProps {
  params: { hsid: string };
}

/**
 * Helper to fetch JSON from an internal API route.
 * The API routes under `/api` return data in JSON format, so we
 * simply call `fetch` and parse the response.  If the request
 * fails, an error is thrown and will surface via Next.js error
 * handling.  When customizing for production you might want to add
 * error boundaries or fallback UIs.
 */
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export default async function HsidPage({ params }: PageProps) {
  const { hsid } = params;
  // Fetch data from the API endpoints concurrently.  The API routes
  // already handle the HSID parameter and return arrays or objects
  // depending on the endpoint.
  const [players, batting, pitching, school] = await Promise.all([
    fetchJson<any[]>(`/api/players/${hsid}`),
    fetchJson<any[]>(`/api/batting/${hsid}`),
    fetchJson<any[]>(`/api/pitching/${hsid}`),
    fetchJson<any>(`/api/schools/${hsid}`),
  ]);

  return (
    <main className="container mx-auto p-6 space-y-8">
      {/* Page heading showing the school name or HSID */}
      <h1 className="text-3xl font-bold">
        {school?.school_name ?? `High School ${hsid}`}
      </h1>

      {/* Players list */}
      <section>
        <h2 className="text-2xl font-semibold mb-2">Players</h2>
        {players?.length ? (
          <ul className="list-disc list-inside space-y-1">
            {players.map((player: any) => (
              <li key={player?.pid ?? player?.id}>{player?.player_name ?? 'Unnamed Player'}</li>
            ))}
          </ul>
        ) : (
          <p>No players found for this school.</p>
        )}
      </section>

      {/* Batting stats JSON dump */}
      <section>
        <h2 className="text-2xl font-semibold mb-2">Batting Stats</h2>
        {batting?.length ? (
          <pre className="overflow-x-auto bg-gray-100 p-4 text-sm rounded-md">
            {JSON.stringify(batting, null, 2)}
          </pre>
        ) : (
          <p>No batting statistics available.</p>
        )}
      </section>

      {/* Pitching stats JSON dump */}
      <section>
        <h2 className="text-2xl font-semibold mb-2">Pitching Stats</h2>
        {pitching?.length ? (
          <pre className="overflow-x-auto bg-gray-100 p-4 text-sm rounded-md">
            {JSON.stringify(pitching, null, 2)}
          </pre>
        ) : (
          <p>No pitching statistics available.</p>
        )}
      </section>
    </main>
  );
}

/**
 * Optionally provide metadata for the dynamic page.  This can
 * improve SEO and provide better sharing previews.  Here we set
 * the title using the HSID; you could fetch more detailed
 * metadata from the school API or database.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { hsid } = params;
  return {
    title: `High School ${hsid} Stats`,
    description: `Statistics and player information for high school ${hsid}.`,
  };
}