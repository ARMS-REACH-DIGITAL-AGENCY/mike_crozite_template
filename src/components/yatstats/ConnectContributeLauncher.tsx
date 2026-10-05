'use client';

import { useState } from 'react';
import ConnectContributeDrawer from './ConnectContributeDrawer';

export default function ConnectContributeLauncher({ hsid }: { hsid: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div style={{ textAlign: 'center', padding: '8px 20px 32px' }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            display: 'inline-block',
            background: 'var(--gold, #ffd700)',
            color: '#000',
            fontWeight: 700,
            fontSize: '16px',
            padding: '14px 32px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Contribute Photos
        </button>
        <p style={{ marginTop: '12px', fontSize: '14px', opacity: 0.8 }}>
          Share photos of your school&apos;s alumni. Up to 10 at a time.
        </p>
      </div>
      <ConnectContributeDrawer hsid={hsid} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
