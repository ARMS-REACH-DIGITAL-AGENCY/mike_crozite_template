// src/components/yatstats/funzone/StatsGrid.tsx
// Renders a titled grid of stat cells (used for current season stats and career totals).

interface StatItem {
  k: string;
  v: string;
}

interface StatsGridProps {
  title: string;
  stats: StatItem[];
}

export default function StatsGrid({ title, stats }: StatsGridProps) {
  if (stats.length === 0) return null;
  return (
    <div className="ov-card">
      <div className="ov-card-title">{title}</div>
      <div className="stats-grid" style={{ border: 'none', marginBottom: 0 }}>
        {stats.map((s, i) => (
          <div key={i} className="stat-cell" style={{ border: '1px solid var(--line)', borderRadius: '4px' }}>
            <div className="stat-label">{s.k}</div>
            <div className="stat-value">{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
