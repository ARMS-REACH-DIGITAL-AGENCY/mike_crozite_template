/** One immutable edition feeds HTML, plain text, browser and delivery. */
export const TRIBUNE_LAYOUT_VERSION = 'tribune-v1' as const;
export const TRIBUNE_BYLINE = 'YaTi | Ai Clubby & All Around Cool Dude';
export const BATTING_COLUMNS = ['OPS+', 'W-L', 'AB', 'H', '2B', '3B', 'HR', 'BB', 'HBP', 'SF', 'OBP', 'SLG', 'OPS'] as const;
export const PITCHING_COLUMNS = ['FIP-', 'W-L', 'IP', 'H', 'R', 'ER', 'HR', 'BB', 'HBP', 'K', 'WHIP', 'K/BB', 'FIP'] as const;
export type TribunePlayerRow = {
  id: string; name: string; team?: string; school?: string; level?: string;
  logoUrl?: string; profileUrl?: string;
  state: 'played' | 'no-appearance' | 'unavailable';
  cells: string[];
};
export type TribuneStatsTable = {
  kind: 'batting' | 'pitching'; rows: TribunePlayerRow[]; totals: string[];
};
export type TribuneRoster = {
  schoolId?: string; title: string; playerCount: number;
  batting: TribuneStatsTable; pitching: TribuneStatsTable;
  clubRecord?: string; note?: string;
};
export type TribuneScoreSide = {
  schoolId: string; name: string; abbreviation: string; location?: string;
  runs: Array<number | null>; total: number;
  opsPlus: Array<number | null>; fipMinus: Array<number | null>;
  clubRecord: [number, number];
};
export type TribuneMatchup = {
  gameId: string; round: number; game: number; week: number;
  start: string; end: string;
  status: 'upcoming' | 'live' | 'final' | 'unavailable';
  away: TribuneScoreSide; home: TribuneScoreSide;
  inningStates: Array<'future' | 'provisional' | 'final'>;
  note?: string;
};
export type TribuneStory = {
  headline: string; deck: string; paragraphs: string[];
  /** Story may be generated only from the edition's facts. Never invent real plays/quotes. */
  source: 'ai' | 'facts' | 'preview';
};
export type TribuneSponsor = {
  id: string; name: string; label?: string; headline: string; body: string;
  url: string; imageUrl?: string; logoUrl?: string; cta: string;
};
export type TribuneEdition = {
  layoutVersion: typeof TRIBUNE_LAYOUT_VERSION;
  preview: boolean;
  dataStatus: 'verified' | 'unavailable' | 'illustrative';
  generatedAt: string;
  school: { id: string; name: string; nickname?: string; location: string; color?: string; logoUrl?: string };
  recipientTier: 'fan' | 'superfan';
  period: { cadence: 'daily' | 'weekly'; start: string; end: string; label: string };
  matchup?: TribuneMatchup;
  story: TribuneStory;
  homeRoster: TribuneRoster;
  follows?: TribuneRoster;
  sponsor?: TribuneSponsor;
  links: { hub: string; tournament: string; share: string; web?: string; text?: string; preferences?: string; unsubscribe?: string; officialRules?: string; sponsorInquiry?: string };
  sender?: { name: string; postalAddress: string };
  notices?: string[];
};
