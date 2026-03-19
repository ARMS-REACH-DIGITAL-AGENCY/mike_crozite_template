# Copilot instructions for this repository

## Project overview
- This repository is a Next.js App Router application for YAT?STATS school microsites.
- The app is written in TypeScript and React, with source files under `src/`.
- The root route in `src/app/page.tsx` redirects to `https://yatstats.com`.

## Important architecture details
- Use the `@/*` path alias for imports from `src`.
- Keep route code in `src/app`, reusable UI in `src/components`, and shared helpers in `src/lib`.
- Database access goes through the PostgreSQL helpers in `src/lib/db.ts`.
- Firebase client configuration lives in `src/lib/firebase.ts` and reads `NEXT_PUBLIC_` environment variables.

## Coding expectations
- Prefer small, surgical changes that match the existing structure and style of the file you touch.
- Keep TypeScript code compatible with the repository's strict compiler settings.
- Do not hardcode secrets or credentials; use environment variables for configuration.
- Preserve the current Next.js App Router patterns and existing dynamic routes such as `src/app/[hsid]`.

## Validation
- Install dependencies with `npm ci`.
- Run linting with `npm run lint`.
- Run a production build with `npm run build`.
- There is currently no dedicated automated test command in `package.json`, so use lint and build as the main validation steps unless you add or update existing tests.
