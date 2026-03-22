This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)

## Getting Started

First run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Security & Audit

See [docs/audit-agent-activity.md](docs/audit-agent-activity.md) for:

- A summary of the last-24-hours activity audit (2026-03-07)
- Background on the Manus debacle and its confirmed rollback
- Step-by-step instructions for auditing bot/agent activity going forward
- Recommended branch-protection and access-control safeguards
# Build 1772083018
# Build v2 1772083186

## College headshot discovery + safe ingestion (vertical slice)

Prerequisites:
- `DATABASE_URL` must point at Neon.
- Install deps once: `npm install`.

Run commands:

```bash
# 1) Discover/refresh source URLs for ingest-enabled schools (21 target schools)
npm run discover:college-sources

# 2) Look up UCLA's real teamid in college_team_sources
psql "$DATABASE_URL" -c "select teamid, team from college_team_sources where team ilike '%UCLA%';"

# 3) Dry-run roster scrape for one school using that real teamid (UCLA = 20054)
npm run ingest:college-rosters -- --teamid 20054 --dry-run

# 4) Live roster scrape for that same teamid
npm run ingest:college-rosters -- --teamid 20054

# 5) Conservative auto-match pass (dry-run first)
npm run match:college-rosters -- --dry-run --limit 200
npm run match:college-rosters -- --limit 200
```

Notes:
- Roster scraping writes to `college_roster_players_raw` only.
- It does **not** write to `player_photos`.
- Newly discovered image URLs remain candidate timeline assets until match review promotes them.
