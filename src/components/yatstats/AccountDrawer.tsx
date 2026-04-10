// src/components/yatstats/AccountDrawer.tsx
// Account drawer wrapper: aside shell + Firebase auth UI

import AccountDrawerContent from "@/components/AccountDrawer";

interface AccountDrawerProps {
  subdomain: string;
}

export default function AccountDrawer({ subdomain }: AccountDrawerProps) {
  return (
    <aside className="yat-drawer yat-drawer-right" id="drawerAccount">
      {/* Header row: JOIN (far left) | LOG IN (center) | X (far right) */}
      {/* The tab switching is handled inside AccountDrawerContent via data attributes */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid var(--line)',
        padding: '0 12px',
        minHeight: '48px',
        gap: '0',
      }}>
        <button
          id="acctTabJoin"
          data-tab="register"
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '12px 4px',
            cursor: 'pointer',
            background: 'transparent',
            border: 'none',
            borderBottom: '2px solid transparent',
            color: 'var(--fg)',
            fontFamily: '"Bebas Neue", Oswald, sans-serif',
            fontSize: '15px',
            letterSpacing: '.06em',
          }}
        >
          JOIN
        </button>
        <button
          id="acctTabLogin"
          data-tab="signin"
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '12px 4px',
            cursor: 'pointer',
            background: 'transparent',
            border: 'none',
            borderBottom: '2px solid transparent',
            color: 'var(--muted)',
            fontFamily: '"Bebas Neue", Oswald, sans-serif',
            fontSize: '15px',
            letterSpacing: '.06em',
          }}
        >
          LOG IN
        </button>
        <button className="yat-icon-btn yat-close-btn" id="closeAccount" style={{ flexShrink: 0 }}>
          <i className="ri-close-line" />
        </button>
      </div>
      <AccountDrawerContent subdomain={subdomain} />
    </aside>
  );
}
