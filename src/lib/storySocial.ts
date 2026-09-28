// src/lib/storySocial.ts
// Shared by the Stories like / comment / share / edit / delete routes.
import 'server-only';
import { NextResponse } from 'next/server';
import { query } from './db';

export const COMMENT_MAX = 2000;

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Story ids are bigints; anything else is a 404, not a database error.
export function parseStoryId(raw: string): string | null {
  return /^\d{1,18}$/.test(raw) ? raw : null;
}

export type LiveStory = { id: string; ownerUid: string | null; playerId: string; hsid: string | null };

export async function loadLiveStory(id: string): Promise<LiveStory | null> {
  const { rows } = await query<{ id: string; owner_uid: string | null; playerid: string; hsid: string | null }>(
    `SELECT id::text AS id, contributor_firebase_uid AS owner_uid, playerid::text AS playerid, hsid::text AS hsid
       FROM player_moment_submissions
      WHERE id = $1 AND status = 'live'`,
    [id]
  );
  const r = rows[0];
  return r ? { id: r.id, ownerUid: r.owner_uid, playerId: r.playerid, hsid: r.hsid } : null;
}

// Every fan action is kept by Firebase uid and ARMS contact (fan_activity).
// Logging never blocks or fails the action itself.
export async function logFanActivity(
  uid: string | null,
  action: string,
  story: LiveStory,
  details: Record<string, unknown> | null = null,
  pageUrl: string | null = null
) {
  try {
    await query(
      `INSERT INTO fan_activity (firebase_uid, arms_contact_id, action, playerid, hsid, moment_id, page_url, details)
       VALUES ($1, (SELECT arms_contact_id FROM user_profiles WHERE firebase_uid = $1 LIMIT 1), $2, $3, $4, $5, $6, $7::jsonb)`,
      [uid, action, story.playerId, story.hsid, story.id, pageUrl, details ? JSON.stringify(details) : null]
    );
  } catch (error) {
    console.error('[stories] activity log failed', action, error);
  }
}
