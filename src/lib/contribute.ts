// src/lib/contribute.ts
// Connect & Contribute: what a fan can send us, shared by the drawer
// (ContributeDrawer), the API (/api/contribute) and the review page.
//
// Every entry point on the site - the YAT?STATS mark on a card, a
// silhouette, a missing headshot, a fallback crest, "missing stats",
// "can't find a player?" - opens the same drawer with openContribute(),
// passing what it already knows (the player, the school, the kind of photo).
//
// The fan picks the player, then one of his seasons (loaded from his
// record), then checks what they have for that season. Labels start with
// where it shows on the site, in the site's own words.

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

// One season of a player's career, as /api/contribute/seasons returns it.
export type Season = {
  key: string;
  year: number;
  stage: 'hs' | 'college' | 'pro';
  team: string;
  // Our (Baseball Cube) team id, for the team's logo.
  teamId?: string;
  level: string;
  // "HS Senior", "College Sophomore", "5th Year / Grad Student", "AAA"...
  label: string;
  current: boolean;
};

export type PhotoPurpose = 'flip_card' | 'back_hero' | 'headshot' | 'timeline_hero' | 'other_photo' | 'school_logo' | 'team_logo';

// Guides drawn over the placement frame:
//   eyes      - a headshot: eyes on the two crossings of the top third
//   name-left - the flip card back: his name is printed over the left side
export type PhotoGuide = 'eyes' | 'name-left';

type PhotoType = {
  id: PhotoPurpose;
  prefix: string;
  label: string;
  // Width / height of the placement frame (the first is the default when
  // there's a choice of orientation); null = kept whole, never cropped.
  aspects: number[] | null;
  guide?: PhotoGuide;
  // What else we need to know: the season (a timeline slide), the team
  // (a team logo), the school (a school logo), or nothing.
  asks?: 'season' | 'team' | 'school';
  // Needs a player tagged (everything but the logos).
  needsPlayer: boolean;
  spec: string;
};

export const PHOTO_TYPES: PhotoType[] = [
  {
    id: 'flip_card',
    prefix: 'Flip Card Front',
    label: 'High School Photo',
    aspects: [5 / 7],
    needsPlayer: true,
    spec: 'The photo on the front of his flip card: him in high school, ideally in uniform. 5x7 portrait. No watermarks, please.',
  },
  {
    id: 'headshot',
    prefix: 'Headshot',
    label: 'Headshot (Any Season)',
    aspects: [5 / 7],
    guide: 'eyes',
    asks: 'season',
    needsPlayer: true,
    spec: "His face and shoulders, like an official team headshot, from the season you pick. His current season's becomes his headshot everywhere; an earlier one goes with that season on his Career Path Timeline. 5x7 portrait: put his eyes on the two marks.",
  },
  {
    id: 'back_hero',
    prefix: 'Flip Card Back',
    label: 'Action Photo (Current Team)',
    aspects: [20 / 7],
    guide: 'name-left',
    needsPlayer: true,
    spec: 'Him playing for his current team, across the top of the back of his flip card. A wide strip: his name is printed on the left, so keep him to the right.',
  },
  {
    id: 'timeline_hero',
    prefix: 'Career Path Timeline',
    label: 'Timeline Hero Image (Yearly Action or Headshot)',
    aspects: [5 / 7, 7 / 5],
    asks: 'season',
    needsPlayer: true,
    spec: "The big image on one season's slide of his Career Path Timeline: an action shot or a headshot from that year. 5x7 or 7x5; we cut him out of the background.",
  },
  {
    id: 'school_logo',
    prefix: 'School Crest',
    label: 'High School Logo',
    aspects: null,
    asks: 'school',
    needsPlayer: false,
    spec: "The school's logo or crest. Square; a PNG with a see-through background is best.",
  },
  {
    id: 'team_logo',
    prefix: 'Team Logo',
    label: 'College or Pro Team Logo',
    aspects: null,
    asks: 'team',
    needsPlayer: false,
    spec: "A college or pro team's logo. Square; a PNG with a see-through background is best.",
  },
  {
    id: 'other_photo',
    prefix: 'Other',
    label: 'Any Other Photo',
    aspects: null,
    asks: 'season',
    needsPlayer: false,
    spec: "Something else? Send it and tell us about it below. We'll place it where it fits best.",
  },
];

export type DataKind = 'stats' | 'team' | 'grad_year' | 'bio' | 'school' | 'all_time' | 'other';

export const DATA_KINDS: { id: DataKind; label: string; hint: string; seasons: 'hs' | 'any' | 'school' }[] = [
  { id: 'stats', label: 'Stats for this season', hint: "What's missing or wrong, and the right numbers. A link to a box score or stat page helps.", seasons: 'any' },
  { id: 'team', label: 'Team or level this season', hint: 'Where did he play this season?', seasons: 'any' },
  { id: 'grad_year', label: 'Graduation year', hint: 'Which year did he graduate high school, and how do you know?', seasons: 'hs' },
  { id: 'bio', label: 'Player info', hint: 'Position, bats/throws, height, honors... anything we have wrong or missing.', seasons: 'any' },
  { id: 'other', label: 'Other', hint: 'Tell us what you see.', seasons: 'any' },
  { id: 'school', label: 'School info', hint: 'Name, mascot, colors, location...', seasons: 'school' },
  { id: 'all_time', label: "Our school's All-Time Next-Level List", hint: 'Former players who played at the next level that we should add. Paste a list or a link.', seasons: 'school' },
];

export const PLAYER_LEVELS = ['MLB', 'Minor leagues', 'College', 'Independent', 'Overseas', 'Retired'];

export const CONTRIBUTE_MAX_PHOTO_BYTES = 4 * 1024 * 1024;

// The crop the fan chose, as fractions of the (upright) photo.
export type Crop = { x: number; y: number; w: number; h: number };

export function photoTypeLabel(id: string) {
  const t = PHOTO_TYPES.find((p) => p.id === id);
  return t ? `${t.prefix} · ${t.label}` : id;
}

export function openContribute(detail: ContributeOpen = {}) {
  window.dispatchEvent(new CustomEvent<ContributeOpen>(CONTRIBUTE_OPEN_EVENT, { detail }));
}

export type ContributeOpen = {
  tab?: ContributeTab;
  photoType?: PhotoPurpose;
  dataKind?: DataKind;
  player?: ContributePlayer | null;
  school?: ContributeSchool | null;
};

// The Connect & Contribute options, each with the icon that stands for it
// everywhere on the site (row 3 of the portal, the drawer's tabs, and the
// entry points on cards and pages). The first four open the drawer; the
// two Connect options are sections of the portal page.
export type ContributeOption = {
  id: string;
  icon: string;
  label: string;
  // The name under its circle in row 3 (one line, like a player's last name).
  short: string;
  tab?: ContributeTab;
  section: string;
};

export const CONTRIBUTE_OPTIONS: ContributeOption[] = [
  { id: 'photo', tab: 'photo', icon: 'ri-camera-3-line', label: 'Photos', short: 'Photos', section: 'cc-photo' },
  { id: 'data', tab: 'data', icon: 'ri-edit-box-line', label: 'Update Data', short: 'Update Data', section: 'cc-data' },
  { id: 'missing', tab: 'missing', icon: 'ri-user-search-line', label: 'Missing Next-Level Alumni', short: 'Missing Alumni', section: 'cc-missing' },
  { id: 'tip', tab: 'tip', icon: 'ri-newspaper-line', label: 'News Tip', short: 'News Tip', section: 'cc-tip' },
  { id: 'player', icon: 'ri-video-chat-line', label: 'Connect with a Player', short: 'Connect', section: 'cc-player' },
  { id: 'sponsor', icon: 'ri-hand-heart-line', label: 'Sponsor this Page', short: 'Sponsor', section: 'cc-sponsor' },
];

export const tabIcon = (tab: ContributeTab) => CONTRIBUTE_OPTIONS.find((o) => o.tab === tab)?.icon || 'ri-upload-cloud-2-line';
