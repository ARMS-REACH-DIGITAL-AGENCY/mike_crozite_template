// src/app/bracket-lab/page.tsx
// Private prototype: the whole 2026 National Alumni Bracket (simulated) as
// flip-card box scores. Not linked from anywhere and not indexed. Data:
// public/bracket-lab/2026 (scripts/simulate-bracket-2026.ts --export).
import type { Metadata } from 'next';
import BracketLab from '@/components/bracket/BracketLab';

export const metadata: Metadata = {
  title: 'Bracket Lab',
  robots: { index: false, follow: false },
};

export default function BracketLabPage() {
  return <BracketLab />;
}
