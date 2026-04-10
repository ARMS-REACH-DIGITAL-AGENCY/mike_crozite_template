// src/app/[hsid]/layout.tsx
// THE UNIFIED SHARED SHELL
// This is the single source of truth for the 5-row system.
// It owns Rows 1-2, the drawers, the footer, and all shared styles/scripts.
// All internal pages (gallery, player profile, news) render as {children} inside this shell.

import { ReactNode } from 'react';
import {
  getSchoolByHsid,
  getSchoolByUrl,
  getAllTimeRosterByHsid,
  getFlipCardFrontStageByHsid,
  getBatchDesignatedPlayerImages,
} from '@/lib/db';
import { headers } from 'next/headers';
import { getSchoolCrestUrl } from '@/lib/schoolAssets';
import {
  getPlayerNowImageUrl,
} from '@/lib/playerImage';
import { getFirebaseConfigJSON } from '@/lib/firebase-config';
import { formatSchoolName, sortActivePlayers, ORG_FILTER_LIST } from '@/lib/playerUtils';
import { notFound } from 'next/navigation';

import type { Metadata } from 'next';

// Shared Components
import YatStyles from '@/components/yatstats/YatStyles';
import YatInteractivity from '@/components/yatstats/YatInteractivity';
import AccountDrawerContent from '@/components/AccountDrawer';
import GlobalSearchModal from '@/components/yatstats/GlobalSearchModal';
import SchoolContextProvider from '@/context/SchoolContext';
import SharedShell from '@/components/yatstats/SharedShell';

export const runtime = 'nodejs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hsid: string }>;
}): Promise<Metadata> {
  const { hsid } = await params;
  const headersList = await headers();
  const host = headersList.get('host') || '';
  let school: Record<string, unknown> | null = null;
  try {
    school = (await getSchoolByHsid(hsid)) as Record<string, unknown> | null;
    if (!school && host) school = (await getSchoolByUrl(`https://${host}`)) as Record<string, unknown> | null;
  } catch {
    school = null;
  }
  const resolvedHsid = String(school?.hsid ?? hsid);
  const schoolName = formatSchoolName(String(school?.hsname || 'YAT?STATS'));
  const crestUrl = getSchoolCrestUrl(resolvedHsid);

  return {
    title: `${schoolName} | YAT?STATS`,
    icons: {
      icon: crestUrl,
      apple: crestUrl,
      shortcut: crestUrl,
    },
    appleWebApp: {
      capable: true,
      title: schoolName,
    },
  };
}

export default async function HsidLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ hsid: string }>;
}) {
  const { hsid } = await params;
  const headersList = await headers();
  const host = headersList.get('host') || '';
  // Resolve school:
  // 1. Always try getSchoolByHsid(hsid) first — this is the player's actual school
  //    when the URL is /{numericHsid}/player/... (cross-school search result)
  // 2. If hsid is non-numeric (e.g. 'hamilton' from a custom domain), fall back to
  //    host-based lookup so custom domains still work.
  let school: Record<string, unknown> | null = null;
  try {
    school = (await getSchoolByHsid(hsid)) as Record<string, unknown> | null;
    if (!school && host) {
      school = (await getSchoolByUrl(`https://${host}`)) as Record<string, unknown> | null;
    }
  } catch {
    notFound();
  }
  if (!school) notFound();

  const resolvedHsid = String(school.hsid ?? hsid);
  const schoolName = formatSchoolName(String(school.hsname || ''));
  const location = String(school.hslocation || '').toUpperCase();
  const crestUrl = getSchoolCrestUrl(resolvedHsid);
  // Subdomain used for GHL tagging in AccountDrawer
  const subdomain = hsid || 'unknown';
  // Build school data for the context providerr
    const schoolData = {
    hsid: resolvedHsid,
    hsName: schoolName,
    hsLocation: location,
    crestUrl,
    primaryColor: String(school.primary_color || '#000000'),
    secondaryColor: String(school.secondary_color || '#FFFFFF'),
  };

  const schoolMeta = {
    activeAlumni:
      typeof school.current_aa === 'number'
        ? school.current_aa
        : school.current_aa != null
          ? Number(school.current_aa)
          : null,

    mlb:
      typeof school.mlb === 'number'
        ? school.mlb
        : school.mlb != null
          ? Number(school.mlb)
          : null,

    natRank:
      typeof school.yatstats_national_rank === 'number'
        ? school.yatstats_national_rank
        : school.yatstats_national_rank != null
          ? Number(school.yatstats_national_rank)
          : null,

 stateRank:
  school.yatstats_state_rank != null
    ? String(school.yatstats_state_rank).trim()
    : null,

    allTime:
      typeof school.atnla === 'number'
        ? school.atnla
        : school.atnla != null
          ? Number(school.atnla)
          : null,

    draftedRatio:
      school.drafted_hs != null && school.drafted != null
        ? `${school.drafted_hs}/${school.drafted}`
        : null,
  };

  // Row 3 strip — full school player universe, same source as Block 5.
  // TBC all-time rows enriched with stage overlay + stage-only rows (YAT00001–YAT00008 etc.).
  // All players included regardless of status so Block 3 can stay in sync with Block 5
  // after filters change. Default visibility is controlled by applyFilters() on load.
  // Strip order uses Active sort (Level → Grad Class → Roster Years → Last Name)
  // so it matches the default Active-page card order in Block 5.
  const [allStageRows, rawAllTimeRoster] = await Promise.all([
    getFlipCardFrontStageByHsid(resolvedHsid),
    getAllTimeRosterByHsid(resolvedHsid),
  ]);

  const stripStageMap = new Map(
    (allStageRows as Record<string, unknown>[]).map((p) => [String(p.playerid), p])
  );

  // TBC all-time rows, enriched with stage overlay
  const stripSeenIds = new Set<string>();
  const stripMerged: Record<string, unknown>[] = [];
  for (const p of rawAllTimeRoster as Record<string, unknown>[]) {
    const id = String(p.playerid);
    const stageRow = stripStageMap.get(id);
    stripMerged.push(stageRow ? { ...p, ...stageRow } : { ...p });
    stripSeenIds.add(id);
  }
  // Stage-only rows not in TBC all-time (includes YAT00001–YAT00008)
  for (const p of allStageRows as Record<string, unknown>[]) {
    const id = String(p.playerid);
    if (!stripSeenIds.has(id)) {
      stripMerged.push({ ...p });
    }
  }
  // Sort with Active sort so strip order matches Block 5 Active-page card order
  const allStripRows = sortActivePlayers(stripMerged);

  const allStripIds = allStripRows.map((p) => String(p.playerid));
  const headshotMap = await getBatchDesignatedPlayerImages(allStripIds, 'HEADSHOT');

  const stripPlayers = allStripRows.map((p) => {
    const playerId = String(p.playerid);
    return {
      id: playerId,
      name: `${String(p.first_name || p.firstname || '')} ${String(p.last_name || p.lastname || '')}`.trim(),
      image:
        headshotMap.get(playerId)?.image_url ||
        getPlayerNowImageUrl(playerId),
    };
  });

  return (
    <SchoolContextProvider schoolData={schoolData}>
      {/* Shared Styles — must be rendered before any visual content */}
      <YatStyles />

      {/* The SharedShell component renders Rows 1-4 and wraps {children} as Row 5.
          On player profile routes, row3Content overrides the gallery strip in Row 3
          and row4Content overrides the empty placeholder in Row 4. */}
      <SharedShell
        hsid={resolvedHsid}
        players={stripPlayers}
        schoolMeta={schoolMeta}
      >
        {children}
      </SharedShell>

      {/* LEFT DRAWER */}
      <aside className="yat-drawer yat-drawer-left" id="drawerLeft">
        <button className="yat-icon-btn yat-close-btn" id="closeLeft" aria-label="Close navigation">
          <i className="ri-close-line" />
        </button>

        <div className="yat-drawer-content">
          <h3>NAVIGATION</h3>

          <div className="yat-drawer-nav">
            <a className="yat-drawer-nav-item" href={`/${resolvedHsid}`}>WHERE THEY YAT?</a>
            <a className="yat-drawer-nav-item" href={`/${resolvedHsid}/news`}>ACTIVE ALUMNI NEWS</a>
            <a className="yat-drawer-nav-item" href={`/${resolvedHsid}#sec-alltime`}>NEXT-LEVEL ALL-TIME LIST</a>
            <a className="yat-drawer-nav-item" href={`/${resolvedHsid}#sec-current`}>2026 HIGH SCHOOL TEAM</a>
            <a className="yat-drawer-nav-item" href={`/${resolvedHsid}#sec-fantasy`}>FANTASY BRACKET TOURNEY</a>
            <a className="yat-drawer-nav-item" href={`/${resolvedHsid}#sec-mentor`}>MENTORSHIP MARKETPLACE</a>
            <a className="yat-drawer-nav-item" href={`/${resolvedHsid}#sec-partner`}>PARTNERSHIP PROGRAM</a>
            <a className="yat-drawer-nav-item" href={`/${resolvedHsid}#sec-about`}>ABOUT US</a>
            <a className="yat-drawer-nav-item" href={`/${resolvedHsid}#sec-faq`}>FAQ’S</a>
          </div>
        </div>
      </aside>

      {/* Right Drawers */}
      <aside className="yat-drawer yat-drawer-right" id="drawerAccount">
        <button className="yat-icon-btn yat-close-btn" id="closeAccount">
          <i className="ri-close-line" />
        </button>
        <h3>ACCOUNT</h3>
        <AccountDrawerContent subdomain={subdomain} />
      </aside>

      <aside className="yat-drawer yat-drawer-right" id="drawerFilters">
        <button className="yat-icon-btn yat-close-btn" id="closeFilters">
          <i className="ri-close-line" />
        </button>
        <h3>FILTERS</h3>
        <div className="yat-drawer-content" id="filters">
          {/* ── My Favorites toggle ─────────────────────────────────────────────
              Always visible. When checked, applyFilters() hides any card that
              doesn't have data-fav="true" (stamped by stampFavorites() on load
              and again on yat-auth-success after login).                      */}
          <details className="yat-filter-group" id="filterFavsGroup">
            <summary>By My Favorites</summary>
            <div className="yat-filter-options">
              <label>
                <input type="checkbox" id="filterFavs" value="favs" />{' '}
                Show my favorites only
              </label>
            </div>
          </details>

          <details className="yat-filter-group" open>
            <summary>By Name</summary>
            <div className="yat-filter-options">
              <input id="filterName" type="text" placeholder="Type a name…" />
            </div>
          </details>

          <details className="yat-filter-group">
            <summary>By Level</summary>
            <div className="yat-filter-options" id="filterLevels">
              <label className="yat-filter-select-all"><input type="checkbox" data-select-all="filterLevels" /> Select All</label>
              {[
                'MLB',
                'TRIPLE-A',
                'DOUBLE-A',
                'HIGH-A',
                'LOW-A',
                'ROOKIE',
                'INDY',
                "INT'L",
                'NCAA-D1',
                'NCAA-D2',
                'NCAA-D3',
                'NAIA',
                'JUCO',
                'HIGH SCHOOL',
              ].map((l) => (
                <label key={l}>
                  <input type="checkbox" value={l} /> {l}
                </label>
              ))}
            </div>
          </details>

          <details className="yat-filter-group">
            <summary>By Graduating Class</summary>
            <div className="yat-filter-options" id="filterGradClass">
              <label className="yat-filter-select-all"><input type="checkbox" data-select-all="filterGradClass" /> Select All</label>
              {[
                '2025',
                '2024',
                '2023',
                '2022',
                '2021',
                '2020',
                '2019',
                '2018',
                '2017',
                '2016',
                '2015',
                '2014',
                '2013',
                '2012',
                '2011',
                '2010',
                '2009',
                '2008',
                '2007',
                '2006',
                '2005',
                '2004',
                '2003',
                '2002',
                '2001',
                '2000',
                '1990-1999',
                '1980-1989',
                'PRE-1980',
              ].map((year) => (
                <label key={year}>
                  <input type="checkbox" value={year} /> {year}
                </label>
              ))}
            </div>
          </details>

          <details className="yat-filter-group">
            <summary>By Status</summary>
            <div className="yat-filter-options" id="filterStatus">
              <label className="yat-filter-select-all"><input type="checkbox" data-select-all="filterStatus" /> Select All</label>
              {['ACTIVE', 'FREE AGENT', 'RETIRED', 'INJURED'].map((s) => (
                <label key={s}>
                  <input type="checkbox" value={s} defaultChecked={s === 'ACTIVE'} /> {s}
                </label>
              ))}
            </div>
          </details>

          <details className="yat-filter-group">
            <summary>By Roster Year</summary>
            <div className="yat-filter-options" id="filterRosterYears">
              <label className="yat-filter-select-all"><input type="checkbox" data-select-all="filterRosterYears" /> Select All</label>
              {Array.from({length: 27}, (_, i) => String(2025 - i)).map((yr) => (
                <label key={yr}>
                  <input type="checkbox" value={yr} /> {yr}
                </label>
              ))}
            </div>
          </details>

          <details className="yat-filter-group">
            <summary>By Organization / Conference</summary>
            <div className="yat-filter-options" id="filterOrgs">
              <label className="yat-filter-select-all"><input type="checkbox" data-select-all="filterOrgs" /> Select All</label>
              {ORG_FILTER_LIST.map((org) => (
                <label key={org}>
                  <input type="checkbox" value={org} /> {org}
                </label>
              ))}
            </div>
          </details>
        </div>

        <div className="yat-drawer-footer">
          <button
            id="filtersReset"
            className="yat-icon-btn"
            style={{ padding: '10px 14px', border: '1px solid var(--line)', borderRadius: '12px' }}
          >
            <i className="ri-restart-line" /> Reset Filters
          </button>
        </div>
      </aside>

      <GlobalSearchModal />
      <div id="drawerMask" className="yat-drawer-mask" />

      {/* Article detail overlay + modal drawer */}
      <div className="yat-article-overlay" id="articleOverlay" />
      <aside
        className="yat-article-modal"
        id="articleModal"
        role="dialog"
        aria-modal="true"
        aria-label="Article detail"
      >
        <div className="yat-article-modal-top">
          <span className="yat-article-modal-label">ALUMNI NEWS</span>
          <button className="yat-article-modal-close" id="articleModalClose" aria-label="Close">
            <i className="ri-close-line" />
          </button>
        </div>
        <div id="articleModalImg" />
        <div className="yat-article-modal-body" id="articleModalBody" />
      </aside>

      {/* Shared Interactivity — must be rendered last */}
      <YatInteractivity
        resolvedHsid={resolvedHsid}
        firebaseConfigJSON={getFirebaseConfigJSON()}
      />
    </SchoolContextProvider>
  );
}
