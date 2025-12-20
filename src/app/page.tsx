/*
 * Root homepage for the microsite application.
 *
 * This simple page acts as the landing page when users visit the base domain
 * (e.g. `yatstats.com`).  It explains that the site serves high school
 * microsites on subdomains and prompts visitors to navigate to a specific
 * school by typing its subdomain (for example `5004.yatstats.com` for the
 * school with HSID 5004).  You can customize this page further or add
 * navigation links to highlight featured schools.
 */

import Head from 'next/head';

export default function Home() {
  return (
    <>
      <Head>
        <title>YATSTATS Microsites</title>
        <meta
          name="description"
          content="Discover high school baseball player stats across the country."
        />
        <link
          href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@300;400&family=Bebas+Neue&display=swap"
          rel="stylesheet"
        />
        <style>{`
          :root {
            --bg: #0c0c0c;
            --fg: #f2f2f2;
          }
          body {
            background: var(--bg);
            color: var(--fg);
            font-family: Oswald, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial,
              sans-serif;
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          h1 {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 3rem;
            margin-bottom: 1rem;
          }
          p {
            font-size: 1rem;
            max-width: 600px;
            text-align: center;
          }
        `}</style>
      </Head>
      <main>
        <h1>Welcome to YATSTATS</h1>
        <p>
          This site hosts baseball microsites for thousands of high schools. To view a
          specific school’s players and stats, append the high school ID to the
          URL as a subdomain. For example, visit{' '}
          <strong>5004.yatstats.com</strong> to see the microsite for HSID 5004. If you are
          deploying locally, navigate to <code>http://localhost:3000/5004</code>.
        </p>
      </main>
    </>
  );
}
