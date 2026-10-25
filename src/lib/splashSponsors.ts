// Choose one sponsor per genuine splash load, not on every internal page.
import manifest from '@/generated/splash-sponsors.json';
import type { TitlePartner } from '@/lib/titlePartners';

const pools = manifest as Record<string, TitlePartner[]>;

export function getSplashSponsor(hsid: string): TitlePartner | null {
  // School-specific inventory wins; a global pool fills schools without one.
  const local = pools[hsid];
  const pool = local?.length ? local : pools.global;
  if (!pool?.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}
