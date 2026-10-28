'use client';

import { useEffect, useState } from 'react';
import type { SponsorCardPublic } from '@/lib/partners/sponsorCardTypes';
import { readSponsorCard } from '@/lib/partners/sponsorCardPresentation';
import SponsorFlipCard from './SponsorFlipCard';

const cache = new Map<string, { until: number; promise: Promise<SponsorCardPublic[]> }>();

/** One batched request per school, shared by concurrent mounts and navigation. */
export function loadSchoolSponsorCards(hsid: string): Promise<SponsorCardPublic[]> {
  if (!/^[1-9][0-9]{0,17}$/.test(hsid)) return Promise.resolve([]);
  const prior = cache.get(hsid);
  if (prior && prior.until > Date.now()) return prior.promise;
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 10_000);
  const entry = { until: Date.now() + 60_000, promise: Promise.resolve([] as SponsorCardPublic[]) };
  entry.promise = fetch(`/api/sponsor-cards/${encodeURIComponent(hsid)}`, { signal: abort.signal })
    .then(async response => {
      if (!response.ok) throw new Error('Sponsor cards are unavailable');
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || !('cards' in data) || !Array.isArray(data.cards)) return [];
      const seen = new Set<string>();
      return data.cards.flatMap(value => {
        const card = readSponsorCard(value);
        if (!card || seen.has(card.id) || (card.hsid && card.hsid !== hsid) || (card.schoolIds.length && !card.schoolIds.includes(hsid))) return [];
        seen.add(card.id);
        return [{ ...card, hsid }];
      });
    })
    .catch(() => {
      // A sponsor feed cannot prevent the alumni roster from rendering.
      entry.until = Date.now() + 30_000;
      return [];
    })
    .finally(() => clearTimeout(timeout));
  cache.set(hsid, entry);
  return entry.promise;
}

export default function SponsorGalleryCards({ hsid }: { hsid: string }) {
  const [result, setResult] = useState<{ hsid: string; cards: SponsorCardPublic[] } | null>(null);
  useEffect(() => {
    let mounted = true;
    loadSchoolSponsorCards(hsid).then(cards => { if (mounted) setResult({ hsid, cards }); });
    return () => { mounted = false; };
  }, [hsid]);

  useEffect(() => {
    if (result?.hsid === hsid) window.dispatchEvent(new CustomEvent('yat:sponsor-cards-loaded', { detail: { hsid, count: result.cards.length } }));
  }, [result, hsid]);

  const cards = result?.hsid === hsid ? result.cards : [];
  return <div className="yat-sponsor-gallery" style={{ display: 'contents' }} data-sponsor-card-count={cards.length}>
    {cards.map(card => <div key={card.id} data-sponsor-card-wrap="true"><SponsorFlipCard card={card} /></div>)}
  </div>;
}
