// Adapted from the 1A-6A prepared reader.
// The 2027 browser displays stored official scores; it never scores games.
import type { GameBox, Index, LbGame } from './gallery';
import type { Prepared } from '@/lib/bracket/preparedIndex';
import { setLiveInning } from './schoolSeason';

let lb: LbGame[] = [];
export const preparedLb = () => lb;

export async function loadPreparedIndex(): Promise<Index> {
  const response = await fetch('/api/bracket/prepared?season=2027', { cache: 'no-store' });
  if (!response.ok) throw new Error('Prepared bracket HTTP ' + response.status);
  const data = await response.json() as Prepared;
  for (const [gameId, day, phase] of data.live) setLiveInning(gameId, day, phase);
  lb = data.lb;
  return data.index;
}

export async function loadPreparedBoxes(file: string): Promise<Record<string, GameBox>> {
  const response = await fetch('/api/bracket/prepared?season=2027&boxes=' + encodeURIComponent(file), { cache: 'no-store' });
  if (!response.ok) throw new Error('Prepared Stat Ledger HTTP ' + response.status);
  return response.json() as Promise<Record<string, GameBox>>;
}
