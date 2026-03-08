// src/components/yatstats/AccountDrawer.tsx
// Account drawer wrapper: aside shell + Firebase auth UI

import AccountDrawerContent from "@/components/AccountDrawer";

interface AccountDrawerProps {
  subdomain: string;
}

export default function AccountDrawer({ subdomain }: AccountDrawerProps) {
  return (
    <aside className="yat-drawer yat-drawer-right" id="drawerAccount">
      <button className="yat-icon-btn yat-close-btn" id="closeAccount">
        <i className="ri-close-line" />
      </button>
      <h3>ACCOUNT</h3>
      <AccountDrawerContent subdomain={subdomain} />
    </aside>
  );
}
