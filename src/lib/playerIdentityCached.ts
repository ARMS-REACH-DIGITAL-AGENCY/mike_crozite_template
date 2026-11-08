// One getPlayerIdentityMeta query per request: the player layout (profile
// header) and the page's search metadata both read it, and React's cache()
// shares the result within a single server render.
import { cache } from 'react';
import { getPlayerIdentityMeta } from '@/lib/db';

export const getPlayerIdentityMetaOnce = cache(getPlayerIdentityMeta);
