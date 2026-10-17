// Shared vector artwork for the Connect & Contribute page and account drawer.
// Keep both entry points visually identical without changing their actions.
export default function ContributeActionIcon({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
      {id === 'video' ? (
        <><rect x="3" y="5" width="12" height="14" rx="2" /><path d="m15 10 6-4v12l-6-4" /></>
      ) : id === 'photo' ? (
        <><path d="M6 17a4 4 0 0 1-.8-7.9A7 7 0 0 1 18.6 9 4 4 0 0 1 18 17" /><path d="M12 21V11m-4 4 4-4 4 4" /></>
      ) : id === 'data' ? (
        <><path d="M3 21h18" /><path d="M4 21V11h4v10M10 21V4h4v17M16 21v-7h4v7" /></>
      ) : (
        <><rect x="4" y="3" width="13" height="18" rx="1" /><path d="M17 8h4v11a2 2 0 0 1-2 2H6M7 7h7M7 11h7M7 15h4M7 18h7" /></>
      )}
    </svg>
  );
}
