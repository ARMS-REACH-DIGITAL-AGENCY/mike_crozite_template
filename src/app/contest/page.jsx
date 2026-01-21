// app/contest/page.jsx
import React from 'react';

async function getData() {
  // Use absolute URL fallback to localhost for dev; production should set NEXT_PUBLIC_SITE_BASE_URL
  const base = process.env.NEXT_PUBLIC_SITE_BASE_URL || 'http://localhost:3000';
  const res = await fetch(`${base}/api/contest/data`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch contest data: ' + res.statusText);
  const payload = await res.json();
  if (payload.error) throw new Error(payload.error);
  return payload.rows || [];
}

export default async function ContestPage() {
  const rows = await getData();

  return (
    <main style={{ padding: 20, fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}>
      <h1>Contest — Week 1 per-inning comparisons</h1>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
        <thead>
          <tr>
            <th style={th}>Game Date</th>
            <th style={th}>Inning</th>
            <th style={th}>Ham OPS+</th>
            <th style={th}>Bas OPS+</th>
            <th style={th}>Ham FIP-</th>
            <th style={th}>Bas FIP-</th>
            <th style={th}>OPS winner</th>
            <th style={th}>FIP winner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={i % 2 ? { background: '#fafafa' } : undefined}>
              <td style={td}>{r.game_date}</td>
              <td style={td}>{r.inning}</td>
              <td style={tdNum}>{r.ham_ops_plus}</td>
              <td style={tdNum}>{r.bas_ops_plus}</td>
              <td style={tdNum}>{r.ham_fip_minus}</td>
              <td style={tdNum}>{r.bas_fip_minus}</td>
              <td style={tdCenter}>{r.ham_run_ops ? 'Hamilton' : r.bas_run_ops ? 'Basha' : '-'}</td>
              <td style={tdCenter}>{r.ham_run_fip ? 'Hamilton' : r.bas_run_fip ? 'Basha' : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

/* simple cell styles */
const th = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '2px solid #ddd',
};

const td = {
  padding: '8px 10px',
  borderBottom: '1px solid #eee',
};

const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const tdCenter = { ...td, textAlign: 'center' };
