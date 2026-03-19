/**
 * Stripe Checkout success landing page.
 * Stripe redirects here after a successful Superfan checkout.
 * The plan is activated server-side via the webhook (checkout.session.completed).
 * This page just shows a confirmation message.
 */

import Link from 'next/link';

export default function SuperfanSuccessPage() {
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
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>⭐</div>
      <h1 style={{ fontSize: '40px', letterSpacing: '.08em', marginBottom: '12px', color: '#FFD700' }}>
        You are now a Superfan!
      </h1>
      <p style={{ fontSize: '14px', color: 'var(--muted, #888)', maxWidth: '480px', lineHeight: '1.6', marginBottom: '32px' }}>
        Your Superfan subscription is active. You can now follow players from any school
        across the YAT?STATS network, build your Dream Team, and access global alumni updates.
      </p>
      <Link
        href="/"
        style={{
          display: 'inline-block',
          padding: '14px 28px',
          background: '#FFD700',
          color: '#000',
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
