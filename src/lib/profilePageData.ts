// Player profile data, kept across requests (Pete, Nov 17 2026: player pages
// must not read the database on every visit; crawlers walking every profile
// took it down in Oct 2026).
// The profile page, its layout and its metadata read these instead of the raw
// loaders, so a profile reads the database at most once an hour per player
// (per team and date range for a schedule), however many fans or crawlers
// visit. Any school-data edit (contribute, review, publish) drops them.
import 'server-only';
import { unstable_cache } from 'next/cache';
import { queryFailureWatch } from '@/lib/queryFailureWatch';
import { CARD_DATA_TTL_SECONDS } from '@/lib/cardDataTtl';
import {
  getPlayerById,
  getNewsByPlayer,
  getPlayerBattingStats,
  getPlayerPitchingStats,
  getPlayerCareerBatting,
  getPlayerCareerPitching,
  getResolvedCurrentTeam,
  getFlipCardTransactionStatus,
  getPlayerSocialHandles,
  getPlayerGameLogs,
  getPlayerTeamStints,
  getTeamSchedule,
  getPlayerIdentityMeta,
} from '@/lib/db';

// A player's stats change with the nightly imports, not by the minute, so
// each loader result is kept for an hour per player (per team and range for a
// schedule). Most loaders turn a failed read into an empty result; such a
// result is returned for this visit but never kept (queryFailureWatch).
const PROFILE_DATA_TTL_SECONDS = CARD_DATA_TTL_SECONDS; // one age for all card data (Pete, Nov 18)
class UnkeptResult<T> { constructor(readonly value: T) {} }
function keptForProfile<A extends string[], T>(name: string, load: (...args: A) => Promise<T>) {
  return async (...args: A): Promise<T> => {
    try {
      return await unstable_cache(async () => {
        const watch = { failed: false };
        const value = await queryFailureWatch.run(watch, () => load(...args));
        if (watch.failed) throw new UnkeptResult(value);
        return value;
      }, ['player-profile', name, ...args], {
        revalidate: PROFILE_DATA_TTL_SECONDS,
        tags: ['player-profile', `player-profile:${args[0] ?? ''}`],
      })();
    } catch (error) {
      if (error instanceof UnkeptResult) return error.value as T;
      throw error;
    }
  };
}

export const keptPlayerById = keptForProfile('player-by-id-v1', getPlayerById);
export const keptProfileNews = keptForProfile('profile-news-v1', (playerId: string) => getNewsByPlayer(playerId, null, true));
export const keptBattingStats = keptForProfile('batting-v1', getPlayerBattingStats);
export const keptPitchingStats = keptForProfile('pitching-v1', getPlayerPitchingStats);
export const keptCareerBatting = keptForProfile('career-batting-v1', getPlayerCareerBatting);
export const keptCareerPitching = keptForProfile('career-pitching-v1', getPlayerCareerPitching);
export const keptResolvedCurrentTeam = keptForProfile('current-team-v1', getResolvedCurrentTeam);
export const keptTransactionStatus = keptForProfile('transaction-status-v1', getFlipCardTransactionStatus);
export const keptSocialHandles = keptForProfile('social-handles-v1', getPlayerSocialHandles);
export const keptGameLogs = keptForProfile('game-logs-v1', getPlayerGameLogs);
export const keptTeamStints = keptForProfile('team-stints-v1', getPlayerTeamStints);
export const keptIdentityMeta = keptForProfile('identity-meta-v1', getPlayerIdentityMeta);
const keptScheduleRange = keptForProfile('team-schedule-v1', (teamId: string, from: string, to: string) =>
  getTeamSchedule(teamId, 400, { from: from || null, to: to || null }));
export function keptTeamSchedule(teamId: string, range: { from?: string | null; to?: string | null }) {
  return keptScheduleRange(String(teamId), String(range.from || ''), String(range.to || ''));
}
