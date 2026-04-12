import AccountDrawerContent from '@/components/AccountDrawer';

interface AccountDrawerProps {
  subdomain: string;
}

export default function AccountDrawer({ subdomain }: AccountDrawerProps) {
  return (
    <aside className="yat-drawer yat-drawer-right" id="drawerAccount">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--line)',
          minHeight: '48px',
          gap: 0,
        }}
      >
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

        <button
          id="closeAccount"
          aria-label="Close account drawer"
          style={{
            width: '48px',
            height: '48px',
            display: 'grid',
            placeItems: 'center',
            background: 'transparent',
            border: 'none',
            borderLeft: '1px solid var(--line)',
            color: 'var(--muted)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <i className="ri-close-line" style={{ fontSize: '18px' }} />
        </button>
      </div>

      <AccountDrawerContent subdomain={subdomain} />
    </aside>
  );
}
