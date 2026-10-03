// src/app/api/cron/process-missing-players/route.ts
// YAT?STATS — Automated missing player processor
// Picks up missing_player_submission rows, AI-moderates, creates flip cards
//
// Flow:
//   1. Fetch unprocessed submissions (no flip card exists for name+hsid)
//   2. Moderate: must have name, school, baseball relevance
//   3. If approved: generate next playerid, insert into flip_card_front_stage + player_hsids
//   4. If rejected: log reason (no status column on submission table)

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 60;

type ModerationResult = {
  approved: boolean;
  reason: string;
};

function moderateSubmission(sub: any): ModerationResult {
  const name = String(sub.player_name || '').trim();
  const notes = String(sub.notes || '').toLowerCase();

  if (name.length < 2) {
    return { approved: false, reason: 'Player name too short' };
  }

  // Check for spam/junk
  if (/test|asdf|xxx|spam/i.test(name)) {
    return { approved: false, reason: 'Spam/junk name detected' };
  }

  // Must have some school info (in notes or hsid)
  const hasSchool = sub.hsid || notes.includes('school:');
  if (!hasSchool) {
    return { approved: false, reason: 'No school information' };
  }

  return { approved: true, reason: 'Auto-approved: valid submission' };
}

async function getNextPlayerId(): Promise<number> {
  const { rows } = await query(
    `SELECT COALESCE(MAX(playerid), 0) + 1 AS next_id FROM public.flip_card_front_stage WHERE playerid ~ '^[0-9]+$'`
  );
  return parseInt(rows[0]?.next_id || '1', 10);
}

async function playerExists(playerName: string, hsid: string | null): Promise<boolean> {
  const { rows } = await query(
    `SELECT 1 FROM public.flip_card_front_stage
     WHERE LOWER(TRIM(player_name)) = LOWER(TRIM($1))
     ${hsid ? 'AND hsid::text = $2' : ''}
     LIMIT 1`,
    hsid ? [playerName, hsid] : [playerName]
  );
  return rows.length > 0;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { rows: submissions } = await query(
      `SELECT * FROM public.missing_player_submission ORDER BY created_at ASC LIMIT 20`
    );

    const results = {
      processed: 0,
      created: 0,
      skipped: 0,
      rejected: 0,
      errors: [] as string[],
    };

    for (const sub of submissions) {
      results.processed++;

      try {
        // Skip if player already exists
        const exists = await playerExists(sub.player_name, sub.hsid);
        if (exists) {
          results.skipped++;
          continue;
        }

        const mod = moderateSubmission(sub);
        if (!mod.approved) {
          results.rejected++;
          console.log(`[missing-players] Rejected "${sub.player_name}": ${mod.reason}`);
          continue;
        }

        // Generate new player ID
        const newPlayerId = await getNextPlayerId();

        // Parse name into first/last
        const nameParts = String(sub.player_name).trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Extract level/position from notes if present
        const notes = String(sub.notes || '');
        const levelMatch = notes.match(/Level:\s*([^|]+)/i);
        const posMatch = notes.match(/Position:\s*([^|]+)/i);

        // Create flip card entry
        await query(
          `INSERT INTO public.flip_card_front_stage
            (playerid, player_name, first_name, last_name, hsid,
             level_label, status_label, discovery_source)
           VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', 'fan_submission')`,
          [
            String(newPlayerId),
            sub.player_name,
            firstName,
            lastName,
            sub.hsid || null,
            levelMatch ? levelMatch[1].trim() : null,
          ]
        );

        // Link player to school
        if (sub.hsid) {
          await query(
            `INSERT INTO public.player_hsids (playerid, hsid)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [String(newPlayerId), sub.hsid]
          );
        }

        results.created++;
        console.log(`[missing-players] Created player ${newPlayerId}: ${sub.player_name}`);
      } catch (err: any) {
        results.errors.push(`Submission ${sub.id}: ${err?.message}`);
      }
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err: any) {
    console.error('[process-missing-players] failed:', err);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
