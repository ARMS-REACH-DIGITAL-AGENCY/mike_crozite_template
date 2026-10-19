'use client';

// src/components/yatstats/SortToggle.tsx
// Newest / oldest first as a single tap: ▲ over ▼, the active one emphasized in monochrome
// (▼ = newest first, high to low - the default; ▲ = oldest first). Used by
// the Stories and News tabs.

export type SortDir = 'newest' | 'oldest';

export default function SortToggle({ dir, onChange }: { dir: SortDir; onChange: (dir: SortDir) => void }) {
  const next = dir === 'newest' ? 'oldest' : 'newest';
  return (
    <button
      type="button"
      className="yst"
      onClick={() => onChange(next)}
      aria-label={dir === 'newest' ? 'Newest first. Tap for oldest first.' : 'Oldest first. Tap for newest first.'}
      title={dir === 'newest' ? 'Newest first' : 'Oldest first'}
    >
      <span className={dir === 'oldest' ? 'yst-on' : ''} aria-hidden="true">▲</span>
      <span className={dir === 'newest' ? 'yst-on' : ''} aria-hidden="true">▼</span>
      <style jsx>{`
        .yst { flex: none; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; width: 42px; min-height: 42px; padding: 0; border: 1px solid rgba(255,255,255,.14); border-radius: 8px; background: rgba(255,255,255,.055); color: rgba(255,255,255,.7); font-size: 10px; line-height: 1; cursor: pointer; }
        .yst span { opacity: .3; }
        .yst .yst-on { opacity: 1; color: #fff; }
        :global(body.light-theme) .yst { border-color: rgba(0,0,0,.16); background: rgba(255,255,255,.52); color: rgba(0,0,0,.7); }
        :global(body.light-theme) .yst .yst-on { color: #111; }
      `}</style>
    </button>
  );
}
