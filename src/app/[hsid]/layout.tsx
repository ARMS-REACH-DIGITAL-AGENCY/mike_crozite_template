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
  getPlayerThenImageUrl,
} from '@/lib/playerImage';
import { getFirebaseConfigJSON } from '@/lib/firebase-config';
import { formatSchoolName, sortActivePlayers, ORG_FILTER_LIST } from '@/lib/playerUtils';
import { notFound } from 'next/navigation';

import type { Metadata } from 'next';

// Shared Components
import YatStyles from '@/components/yatstats/YatStyles';
import YatInteractivity from '@/components/yatstats/YatInteractivity';
import AccountDrawer from '@/components/yatstats/AccountDrawer';
import GlobalSearchModal from '@/components/yatstats/GlobalSearchModal';
import SchoolContextProvider from '@/context/SchoolContext';
import SharedShell from '@/components/yatstats/SharedShell';

function normalizeStatusLabel(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function buildStatusFilterOptions(rows: Record<string, unknown>[]): string[] {
  const statuses = new Set<string>();

  const NON_STATUS_VALUES = new Set([
    'MLB',
    'TRIPLE-A',
    'AAA',
    'DOUBLE-A',
    'AA',
    'HIGH-A',
    'A+',
    'SINGLE-A',
    'A',
    'LOW-A',
    'A-',
    'ROOKIE',
    'RK',
    'ROK',
    'INDY',
    'INDEPENDENT',
    "INT'L",
    'INTERNATIONAL',
    'NCAA',
    'NCAA-D1',
    'NCAA-D2',
    'NCAA-D3',
    'D1',
    'D2',
    'D3',
    'NAIA',
    'JUCO',
    'JRCOLLEGE',
    'NJCAA',
    'HIGH SCHOOL',
    'HS',
  ]);

  // Baseline statuses we want available even if not currently present on this school.
  statuses.add('ACTIVE');
  statuses.add('RETIRED');
  statuses.add('FREE AGENT');
  statuses.add('INJURED');
  statuses.add('REDSHIRT');
  statuses.add('PARTNER/SPONSOR');

  for (const row of rows) {
    const status = normalizeStatusLabel(row.status_label);
    if (status && !NON_STATUS_VALUES.has(status)) {
      statuses.add(status);
    }
  }

  const priority = [
    'ACTIVE',
    'INJURED - FULL SEASON',
    'INJURED',
    'DEVELOPMENT LIST',
    'DESIGNATED FOR ASSIGNMENT',
    'FREE AGENT',
    'REDSHIRT',
    'PARTNER/SPONSOR',
    'PARTNER - SPONSOR',
    'RETIRED',
  ];

  return Array.from(statuses).sort((a, b) => {
    const ai = priority.indexOf(a);
    const bi = priority.indexOf(b);

    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;

    return a.localeCompare(b);
  });
}

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
  // Subdomain passed to AccountDrawer — MUST be the numeric hsid (e.g. '5004'),
  // not the name slug (e.g. 'hamilton'), so home_hsid in user_profiles is always numeric.
  const subdomain = resolvedHsid || hsid || 'unknown';
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

const statusFilterOptions = buildStatusFilterOptions(
  allStageRows as Record<string, unknown>[]
);
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
 // Row 3 must contain the full hsid universe.
// Visibility/order is controlled client-side so Block 3 can mirror Block 5
// after section changes and filter changes.
const allStripRows = sortActivePlayers(stripMerged);

   const stripPlayers = allStripRows.map((p) => {
  const playerId = String(p.playerid);

  return {
    id: playerId,
    name: `${String(p.first_name || p.firstname || '')} ${String(p.last_name || p.lastname || '')}`.trim(),
    image: `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now/${playerId}.jpg`,
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
            {/* MY HOME SCHOOL — shown only when logged in; home crest + link back to home microsite */}
            <a
              className="yat-drawer-nav-item yat-drawer-home-school"
              id="drawerHomeSchoolLink"
              href="#"
              data-home-nav="true"
              style={{ display: 'none' }}
            >
	              <img
	                id="drawerHomeCrestImg"
	                src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
	                alt="Home school crest"
	                className="yat-drawer-crest-thumb"
	              />
              <span>MY HOME SCHOOL</span>
            </a>

            {/* CURRENTLY VISITING — always shown; crest changes with current microsite */}
            <a className="yat-drawer-nav-item yat-drawer-visiting-school" href={`/${resolvedHsid}`}>
              <img
                src={crestUrl}
                alt={`${schoolName} crest`}
                className="yat-drawer-crest-thumb"
              />
              <span>WHERE THEY YAT?</span>
            </a>
            <a className="yat-drawer-nav-item" data-tab="news" href="#sec-news">ACTIVE ALUMNI NEWS</a>
            <a className="yat-drawer-nav-item" data-tab="alltime" href="#sec-alltime">NEXT-LEVEL ALL-TIME LIST</a>
            <a className="yat-drawer-nav-item" data-tab="current" href="#sec-current">2026 HIGH SCHOOL TEAM</a>
            <a className="yat-drawer-nav-item" data-tab="fantasy" href="#sec-fantasy">FANTASY BRACKET TOURNEY</a>
            <a className="yat-drawer-nav-item" data-tab="mentor" href="#sec-mentor">MENTORSHIP MARKETPLACE</a>
            <a className="yat-drawer-nav-item" data-tab="partner" href="#sec-partner">PARTNERSHIP PROGRAM</a>
            <a className="yat-drawer-nav-item" data-tab="about" href="#sec-about">ABOUT US</a>
            <a className="yat-drawer-nav-item" data-tab="faq" href="#sec-faq">FAQ'S</a>
          </div>
        </div>
      </aside>

      {/* Right Drawers */}
      <AccountDrawer subdomain={subdomain} />

   <aside className="yat-drawer yat-drawer-right" id="drawerFilters">
  <div
    className="yat-drawer-header"
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '10px',
      padding: '12px 14px',
      borderBottom: '1px solid var(--line)',
    }}
  >
    <h3 style={{ margin: 0 }}>FILTERS</h3>

    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <button
        id="filtersReset"
        className="yat-icon-btn"
        aria-label="Reset filters"
        title="Reset filters"
      >
        <i className="ri-restart-line" />
      </button>

      <button className="yat-icon-btn" id="closeFilters" aria-label="Close filters">
        <i className="ri-close-line" />
      </button>
    </div>
  </div>

  <div className="yat-drawer-content" id="filters">

          {/* ── SHOW MY FAVORITES ─────────────────────────────────────────────
              Two checkboxes always visible. Clicking while not authenticated
              or wrong tier opens the Account drawer via JS auth-gate.        */}
          <details className="yat-filter-group" id="filterFavsGroup" open>
            <summary>Show My Favorites</summary>
            <div className="yat-filter-options">
              <label>
                <input type="checkbox" id="filterFavsHome" value="favs-home" />{' '}
                Home School
              </label>
              <label style={{ marginTop: '6px' }}>
                <input type="checkbox" id="filterFavsAll" value="favs-all" />{' '}
                All Schools{' '}
                <span style={{ fontSize: '10px', color: '#FFD700', fontFamily: '"Bebas Neue", Oswald, sans-serif', letterSpacing: '.04em' }}>⭐ SUPERFAN</span>
              </label>
            </div>
          </details>

          {/* ── BY STATUS (always open) ─────────────────────────────────────── */}
		<details className="yat-filter-group" open>
  			<summary>By Status</summary>
  			<div className="yat-filter-options" id="filterStatus">
   			 <label className="yat-filter-select-all">
     			 <input type="checkbox" data-select-all="filterStatus" /> Select All
   			 </label>

    		{statusFilterOptions.map((s) => (
      			<label key={s}>
      			  <input type="checkbox" value={s} defaultChecked={s === 'ACTIVE'} /> {s}
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

          <details className="yat-filter-group">
            <summary>By Name</summary>
            <div className="yat-filter-options">
              <input id="filterName" type="text" placeholder="Type a name…" />
            </div>
          </details>
        </div>
      </aside>

      <GlobalSearchModal />
      <div id="drawerMask" className="yat-drawer-mask" />

{/* Shared Interactivity — must be rendered last */}
      <YatInteractivity
        resolvedHsid={resolvedHsid}
        firebaseConfigJSON={getFirebaseConfigJSON()}
      />
    </SchoolContextProvider>
  );
}
