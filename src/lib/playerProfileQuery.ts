// src/lib/playerProfileQuery.ts
// Loads player profile data: primary image, timeline gallery, and recent moments.
// Used by the player profile page (server component).

import { query } from '@/lib/db';

export interface PlayerPrimaryPhoto {
  photo_id: string;
  playerid: string;
  s3_bucket: string;
  s3_key: string;
  file_name: string;
  mime_type: string;
  caption: string | null;
  photo_date: string | null;
  photo_year: number | null;
  approval_status: string;
  visibility_status: string;
  created_at: string;
}

export interface PlayerTimelinePhoto {
  photo_id: string;
  playerid: string;
  s3_bucket: string;
  s3_key: string;
  file_name: string;
  mime_type: string;
  caption: string | null;
  photo_date: string | null;
  photo_year: number | null;
  approval_status: string;
  visibility_status: string;
  created_at: string;
}

export interface PlayerMoment {
  id: string;
  playerid: string;
  moment_date: string;
  title: string;
  description: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerProfile {
  primaryImage: PlayerPrimaryPhoto | null;
  timelinePhotos: PlayerTimelinePhoto[];
  moments: PlayerMoment[];
}

/**
 * Fetches the player profile data for a given playerid.
 * Runs three queries in parallel for efficiency.
 */
export async function getPlayerProfile(playerid: bigint | string | number): Promise<PlayerProfile> {
  const pid = String(playerid);

  const [primaryRes, timelineRes, momentsRes] = await Promise.all([
    query<PlayerPrimaryPhoto>(
      `SELECT * FROM public.v_player_primary_photo WHERE playerid = $1 LIMIT 1`,
      [pid]
    ),
    query<PlayerTimelinePhoto>(
      `SELECT * FROM public.v_player_timeline_photos WHERE playerid = $1`,
      [pid]
    ),
    query<PlayerMoment>(
      `SELECT * FROM public.player_moments WHERE playerid = $1 ORDER BY moment_date DESC LIMIT 10`,
      [pid]
    ),
  ]);

  return {
    primaryImage: primaryRes.rows[0] ?? null,
    timelinePhotos: timelineRes.rows,
    moments: momentsRes.rows,
  };
}
