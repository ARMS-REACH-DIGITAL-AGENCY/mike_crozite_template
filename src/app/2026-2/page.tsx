import { redirect } from 'next/navigation';

// The historical test is the original YAT?STATS school interface.
// There is deliberately no separate replay results dashboard.
export default function Replay2026Home() {
  redirect('/5004?sim2026=1&week=1&asof=2026-04-01#sec-fantasy');
}
