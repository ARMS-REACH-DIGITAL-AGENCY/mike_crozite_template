'use client';

import { useEffect } from 'react';

type Key = 'active' | 'alltime' | 'current' | 'news';
const galleries = new Set<Key>(['active', 'alltime', 'current']);
const groups = ['filterStatus','filterLevels','filterOrgs','filterGradClass','filterRosterYears'];
const rank: Record<string,number> = {'MLB':1,'TRIPLE-A':2,'DOUBLE-A':3,'HIGH-A':4,'LOW-A':5,'ROOKIE':6,'INDY':7,"INT'L":8,'NCAA-D1':9,'NCAA-D2':10,'NCAA-D3':11,'NAIA':12,'JUCO':13,'HIGH SCHOOL':14};
const NOW_IMAGE_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now';

function key(): Key {
  const visible = document.querySelector<HTMLElement>('.yat-section.visible');
  const value = (visible?.id.replace('sec-','') || location.hash.replace('#sec-','') || 'active') as Key;
  return value;
}
function grid(k: Key){ return document.getElementById(`${k}-grid`); }
function cards(k: Key){ return Array.from(grid(k)?.query