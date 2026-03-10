/**
 * Stripe Checkout cancel landing page.
 * Stripe redirects here if the user closes the checkout without completing payment.
 */

import Link from 'next/link';

export default function SuperfanCancelPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        fontFamily: '"Bebas Neue", Oswald, sans-serif',
        background: 'var(--bg, #0d0d0d)',
        color: 'var(--fg, #f0f0f0)',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '36px', letterSpacing: '.08em', marginBottom: '12px' }}>
        No worries!
      </h1>
      <p style={{ fontSize: '14px', color: 'var(--muted, #888)', maxWidth: '420px', lineHeight: '1.6', marginBottom: '32px' }}>
        You can become a Superfan any time to follow players from any school in the YAT?STATS network.
      </p>
      <Link
        href="/"
        style={{
          display: 'inline-block',
          padding: '14px 28px',
          background: 'var(--fg, #f0f0f0)',
          color: 'var(--bg, #0d0d0d)',
          borderRadius: '8px',
          fontFamily: '"Bebas Neue", Oswald, sans-serif',
          fontSize: '16px',
          letterSpacing: '.08em',
          textDecoration: 'none',
        }}
      >
        Back to YAT?STATS
      </Link>
    </main>
  );
}
