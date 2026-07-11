'use client';

import { useEffect } from 'react';

type GallerySectionKey = 'active' | 'alltime' | 'current' | 'news';

const PLAYER_GALLERY_KEYS = new Set<GallerySectionKey>(['active', 'alltime', 'current']);
const FILTER_GROUP_IDS = [
  'filterStatus',
  'filterLevels',
  'filterOrgs',
  'filterGradClass',
  'filterRosterYears',
] as const;

const LEVEL_RANK: Record<string, number> = {
  MLB: 1,
  'TR