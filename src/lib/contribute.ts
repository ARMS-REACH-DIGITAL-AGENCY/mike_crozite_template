// src/lib/contribute.ts
// Connect & Contribute: what a fan can send us, shared by the drawer
// (ContributeDrawer), the API (/api/contribute) and the review page.
//
// Every entry point on the site - the YAT?STATS mark on a card, a
// silhouette, a missing headshot, a fallback crest, "missing stats",
// "can't find a player?" - opens the same drawer with openContribute(),
// passing what it already knows (the player, the school, the kind of photo).

export const CONTRIBUTE_OPEN_EVENT = 'yat:contribute-open';

export type ContributeTab = 'photo' | 'data' | 'missing' | 'tip';

export type ContributePlayer = {
  playerId: string;
  displayName: string;
  schoolId?: string;
  schoolName?: string;
  crestUrl?: string;
};

export type ContributeSchool = { hsid: string; name: string; location?: string };

export type PhotoPurpose = 'flip_card' | 'headshot' | 'year_headshot' | 'back_hero' | 'school_logo';

export type DataKind = 'grad_year' | 'stats' | 'team' | 'bio' | 'photo' | 'school' | 'all_time' | 'other';

export type ContributeOpen = {
  tab?: ContributeTab;
  photoType?: PhotoPurpose;
  dataKind?: DataKind;
  player?: ContributePlayer | null;
  school?: ContributeSchool | null;
};

// What each kind of photo is for, and what we need (shown in the drawer).
export const PHOTO_TYPES: { id: PhotoPurpose; label: string; forSchool?: boolean; spec: string }[] = [
  {
    id: 'flip_card',
    label: 'High school photo (front of his flip card)',
    spec: 'Him in high school, ideally in uniform. Tall (portrait) works best; we crop it to 5x7. No watermarks, please.',
  },
  {
    id: 'headshot',
    label: 'Current headshot',
    spec: 'His face and shoulders, from this season. Tall (portrait); we crop it to 5x7.',
  },
  {
    id: 'year_headshot',
    label: 'Headshot from a past year',
    spec: 'A headshot from one school year: pick which one. We keep a set, freshman to senior, for his Career Path timeline.',
  },
  {
    id: 'back_hero',
    label: 'Action photo (back of his flip card)',
    spec: 'Him playing for his current team. Wide (landscape) works best.',
  },
  {
    id: 'school_logo',
    label: 'High school logo',
    forSchool: true,
    spec: "The school's logo or crest. A PNG with a see-through background is best.",
  },
];

export const CLASS_YEARS = [
  'HS Freshman', 'HS Sophomore', 'HS Junior', 'HS Senior',
  'College Freshman', 'College Sophomore', 'College Junior', 'College Senior',
];

export const DATA_KINDS: { id: DataKind; label: string; hint: string }[] = [
  { id: 'grad_year', label: 'Graduation year', hint: 'Which year did he graduate high school, and how do you know?' },
  { id: 'stats', label: 'Missing or wrong stats', hint: 'Which games or seasons, and what the numbers should be. A link to a box score helps.' },
  { id: 'team', label: 'Current team or level', hint: 'Where is he playing now?' },
  { id: 'bio', label: 'Player info', hint: 'Position, bats/throws, height, college, anything we have wrong or missing.' },
  { id: 'photo', label: 'Wrong or bad photo', hint: "Which photo, and what's wrong with it?" },
  { id: 'school', label: 'School info', hint: 'Name, mascot, colors, location...' },
  { id: 'all_time', label: "Our school's All-Time list", hint: 'Former players who played at the next level that we should add. Paste a list or a link.' },
  { id: 'other', label: 'Something else', hint: 'Tell us what you see.' },
];

export const PLAYER_LEVELS = ['MLB', 'Minor leagues', 'College', 'Independent', 'Overseas', 'Retired'];

export const CONTRIBUTE_MAX_PHOTOS = 10;
export const CONTRIBUTE_MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export function openContribute(detail: ContributeOpen = {}) {
  window.dispatchEvent(new CustomEvent<ContributeOpen>(CONTRIBUTE_OPEN_EVENT, { detail }));
}
