// src/components/yatstats/shell/SchoolContextBar.tsx
'use client';

import { useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SchoolContext } from '@/context/SchoolContext';
import { PlayerProfileContext } from '@/context/PlayerProfileContext';
import { CREST_FALLBACK_PATH } from '@/lib/schoolAssets';
import FavoriteButton from '@/components/yatstats/FavoriteButton';

interface SchoolContextBarProps {
  isPlayerProfile: boolean;
  isGallery: boolean;
  isNews: boolean;
}

function formatSlugToLabel(slug: string): string {
  return slug.split('-').filter(Boolean).map((part) => part.to