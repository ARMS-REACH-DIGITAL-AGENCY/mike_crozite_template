// One getPlayerIdentityMeta read per request (React cache) and at most one
// per hour per player across requests (keptForProfile): the player layout
// (profile header) and the page's search metadata both read it.
import { cache } from 'react';
import { keptIdentityMeta } from '@/lib/profilePageData';

export const getPlayerIdentityMetaOnce = cache(keptIdentityMeta);
