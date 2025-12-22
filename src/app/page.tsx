// src/app/page.tsx

export const runtime = 'nodejs';

import { headers } from 'next/headers';
import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __yatstatsPool: Pool | undefined;
}

function getPool() {
  if (!global.__yatstatsPool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }

    global.__yatstatsPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Keep this as you had it; adjust later if you switch to a managed Postgres that needs different SSL behavior.
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  return global.__yatstatsPool;
}

function safeText(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function safeNum(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default async function Home() {
  const headerList = headers();
  const host = headerList.get('host') || 'yatstats.com';
  const hsid = host.split('.')[0] || 'yatstats';

  // Main domain (no HSID subdomain)
  if (hsid === 'yatstats') {
    return (
      <main
        style={{
          padding: 40,
          textAlign: 'center',
          background: '#0
