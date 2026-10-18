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

export type ContributeTeam = {
  teamId: string;
  name: string;
  shortName?: string;
  nickname?: string;
  orgName?: string;
  orgAbbrev?: string;
  level?: string;
  location?: string;
  logoUrl?: string;
};

// One season of a player's career, as /api/contribute/seasons returns it.
// Every year of a player's life a photo can belong to, newest first: the
// seasons we have (from his stats), and every other year back to his birth
// year (his class year minus 18, the same age-18 graduation the Career Path
// Timeline uses) as a plain year - "Age 12" before high school. A player
// without a class year gets just his seasons.
export function yearsOfHisLife(seasons: Season[], classOf: number | null, thisYear = new Date().getFullYear()): Season[] {
  const birth = classOf ? classOf - 18 : null;
  const first = Math.min(birth ?? thisYear, ...seasons.map((s) => s.year));
  const out: Season[] = [];
  for (let year = Math.max(thisYear, ...seasons.map((s) => s.year)); year >= first; year--) {
    const ofYear = seasons.filter((s) => s.year === year);
    if (ofYear.length) { out.push(...ofYear); continue; }
    if (birth === null) continue;
    const age = year - birth;
    const youth = classOf !== null && year < classOf - 3;
    out.push({
      key: `year-${year}`,
      year,
      stage: youth ? 'youth' : 'other',
      team: '',
      level: '',
      label: youth ? (age === 0 ? 'The year he was born' : `Age ${age}`) : '',
      current: false,
    });
  }
  return out;
}

export type Season = {
  key: string;
  year: number;
  // youth: before high school; other: a year we have no season for.
  stage: 'youth' | 'hs' | 'college' | 'pro' | 'coach' | 'other';
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
    prefix: 'HIGH SCHOOL · FLIP CARD FRONT',
    label: 'High School Photo',
    aspects: [5 / 7],
    needsPlayer: true,
    spec: 'The photo on the front of his flip card: him in high school, ideally in uniform. 5x7 portrait. No watermarks, please.',
  },
  {
    id: 'headshot',
    prefix: 'CURRENT SEASON · ROW 3',
    label: 'Current Player Headshot',
    aspects: [5 / 7],
    guide: 'eyes',
    asks: 'season',
    needsPlayer: true,
    spec: "His face and shoulders, like an official team headshot, from the season you pick. His current season's becomes his headshot everywhere; an earlier one goes with that season on his Career Path Timeline. 5x7 portrait: put his eyes on the two marks.",
  },
  {
    id: 'back_hero',
    prefix: 'CURRENT SEASON · FLIP CARD BACK',
    label: 'Current Action Photo',
    aspects: [20 / 7],
    guide: 'name-left',
    needsPlayer: true,
    spec: 'Him playing for his current team, across the top of the back of his flip card. A wide strip: his name is printed on the left, so keep him to the right.',
  },
  {
    id: 'timeline_hero',
    prefix: 'PAST SEASONS · CAREER PATH',
    label: 'Career Path Year Photo',
    aspects: [5 / 7, 7 / 5],
    asks: 'season',
    needsPlayer: true,
    spec: "A bust or action photo identifying a specific playing year on the Career Path Timeline. This is the slide's hero image, NOT a fan memory or story post. 5x7 or 7x5; we remove the background.",
  },
  {
    id: 'school_logo',
    prefix: 'SCHOOL / CURRENT TEAM',
    label: 'School or Current Team Logo',
    aspects: null,
    asks: 'school',
    needsPlayer: false,
    spec: "The school's logo or crest. Square; a PNG with a see-through background is best.",
  },
  {
    id: 'team_logo',
    prefix: 'SCHOOL / CURRENT TEAM',
    label: 'School or Current Team Logo',
    aspects: null,
    asks: 'team',
    needsPlayer: false,
    spec: "A college or pro team's logo. Square; a PNG with a see-through background is best.",
  },
  {
    id: 'other_photo',
    prefix: 'ADDITIONAL PHOTOS',
    label: 'Other Photo',
    aspects: null,
    asks: 'season',
    needsPlayer: true,
    spec: "Another photo from a player's selected year. It publishes immediately to that player's Career Path Timeline.",
  },
];

// No stats: those come from our official stat provider.
export type DataKind = 'team' | 'grad_year' | 'bio' | 'school' | 'all_time' | 'other';

export const DATA_KINDS: { id: DataKind; label: string; hint: string; seasons: 'hs' | 'any' | 'school' }[] = [
  { id: 'team', label: 'Team or league this season', hint: "A team or league we don't list: summer ball, a fall league, a travel team.", seasons: 'any' },
  { id: 'grad_year', label: 'Graduation year', hint: 'Which year did he graduate high school, and how do you know?', seasons: 'hs' },
  { id: 'bio', label: 'Player info', hint: 'Height, weight, position, bats/throws, honors... anything we have wrong or missing.', seasons: 'any' },
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
// everywhere on the site, in the order of the portal page: the three
// Connect sections first, then the four ways to contribute. Row 3 of the
// portal and the signed-in account drawer list them all; each scrolls to
// its section of the page, where a button opens its drawer (from the left).
export type ContributeOption = {
  id: string;
  icon: string;
  label: string;
  // The name under its circle in row 3 (one line, like a player's last name).
  short: string;
  // One line on what it is, for the account drawer.
  blurb: string;
  tab?: ContributeTab;
  section: string;
};

export const CONTRIBUTE_OPTIONS: ContributeOption[] = [
  { id: 'video', icon: 'ri-video-chat-line', label: 'VIDEO MESSAGE', short: 'VIDEO MESSAGE', blurb: 'YAT-A-BOY player video exchange — coming soon.', section: 'sec-video' },
  { id: 'photo', tab: 'photo', icon: 'ri-upload-cloud-2-line', label: 'PHOTO UPLOADS', short: 'PHOTO UPLOADS', blurb: 'High school, headshots, action pics, yearly pics, and team logos.', section: 'cc-photo' },
  { id: 'data', tab: 'data', icon: 'ri-bar-chart-2-line', label: 'ADD PLAYER INFO', short: 'ADD PLAYER INFO', blurb: 'Correct a player or add a missing next-level alumnus.', section: 'cc-data' },
  { id: 'tip', tab: 'tip', icon: 'ri-newspaper-line', label: 'SHARE NEWS TIP', short: 'SHARE NEWS TIP', blurb: 'Send a published player news link.', section: 'cc-tip' },
]

// What a sponsorship inquiry is about (the portal's Partner Program form).
export const SPONSOR_INTERESTS = {
  title: 'Co-Brand Title Sponsor',
  profile: 'Active Alumni Profile Sponsor',
  bracket: 'Bracket Ticket Message',
  alumni: 'My own profile (Where YAT Now?)',
  other: 'Something else',
  video: 'Personalized Player Video Interest',
  video_player: 'Player Video Program Application',
} as const;
export type SponsorInterest = keyof typeof SPONSOR_INTERESTS;

// The transaction desk listens for these requests anywhere in the school shell.
// Sponsorship and alumni-business shortcuts share its compact slide-in inquiry
// form; photo/data/news options continue using the separate contribution drawer.
export const CONNECT_INQUIRY_EVENT = 'yat:connect-inquiry';
export function openConnectInquiry(interest: SponsorInterest) {
  window.dispatchEvent(new CustomEvent<SponsorInterest>(CONNECT_INQUIRY_EVENT, { detail: interest }));
}

// The Connect & Contribute page, opened on one of its sections. A school
// subdomain adds the school itself; a bare host (previews) needs /<hsid>.
export function contributeSectionHref(hsid: string, section: string) {
  return `/${encodeURIComponent(hsid)}/connect-contribute#${section}`;
}

// Scroll the portal page to a section (row 3, and links on the page).
export function scrollToContributeSection(section: string) {
  // Mobile portal cards live in mutually exclusive tabs. Notify the page
  // before scrolling, so a Row 3 shortcut never targets a hidden card.
  try { history.replaceState(null, '', `#${section}`); } catch {}
  window.dispatchEvent(new CustomEvent('yat-contribute-navigate', { detail: { section } }));
  requestAnimationFrame(() => {
    requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  });
}

export const tabIcon = (tab: ContributeTab) => CONTRIBUTE_OPTIONS.find((o) => o.tab === tab)?.icon || 'ri-upload-cloud-2-line';

// A player id on the site: a number, or our own YAT-prefixed id for alumni
// and coaches who aren't in the stat provider's data (Mike Woods: YAT000072).
export const PLAYER_ID = /^(?:YAT)?\d+$/i;
