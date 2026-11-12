import { NextRequest, NextResponse } from 'next/server';
import { writerQuery as query } from '@/lib/dbWriter';
import { findOrCreateGhlContact, sendGHLEmail } from '@/lib/gohighlevel';
import { buildAuditEmail } from '@/lib/contributionAuditDigest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AuditGroup {
  entity_type: string; entity_id: string; playerid: string | null; hsid: string | null;
  before_data: unknown; after_data: unknown; latest_source: string | null;
  sources: string[]; event_count: number; attributed_events: number; unknown_events: number;
  first_at: string; last_at: string; player_name: string | null; school_name: string | null;
}
interface ExceptionalEvent {
  entity_type: string; entity_id: string; playerid: string | null; hsid: string | null;
  source: string | null; occurred_at: string; before_data: unknown; after_data: unknown;
  actor_email: string | null; actor_uid: string | null; player_name: string | null; school_name: string | null;
}
interface SourceCount { source: string | null; events: number }

// Keep original audit events. Collapse repetitive writes only for the email summary.
const dayFilter = `a.occurred_at >= (date_trunc('day',now() AT TIME ZONE 'America/Phoenix')-interval '1 day') AT TIME ZONE 'America/Phoenix'
 AND a.occurred_at < date_trunc('day',now() AT TIME ZONE 'America/Phoenix') AT TIME ZONE 'America/Phoenix'`;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { rows: groups } = await query<AuditGroup>(`WITH day_events AS (
      SELECT a.*, COALESCE(a.actor_uid,fa.firebase_uid) AS resolved_actor_uid,
        COALESCE(a.actor_email,u.email) AS resolved_actor_email
      FROM public.contribution_change_audit a
      LEFT JOIN LATERAL (
        SELECT f.firebase_uid FROM public.fan_activity f
        WHERE a.entity_type='photo' AND f.action LIKE 'contribute_photo%'
          AND f.details->>'upload_id'=a.entity_id
        ORDER BY f.created_at DESC LIMIT 1
      ) fa ON TRUE
      LEFT JOIN public.user_profiles u ON u.firebase_uid=COALESCE(a.actor_uid,fa.firebase_uid)
      WHERE ${dayFilter}
    ), grouped AS (
      SELECT a.entity_type,a.entity_id,
        (array_agg(a.playerid ORDER BY a.occurred_at DESC,a.id DESC))[1] AS playerid,
        (array_agg(a.hsid ORDER BY a.occurred_at DESC,a.id DESC))[1] AS hsid,
        (array_agg(a.before_data ORDER BY a.occurred_at,a.id))[1] AS before_data,
        (array_agg(a.after_data ORDER BY a.occurred_at DESC,a.id DESC))[1] AS after_data,
        (array_agg(a.source ORDER BY a.occurred_at DESC,a.id DESC))[1] AS latest_source,
        array_agg(DISTINCT COALESCE(NULLIF(a.source,''),'unknown')) AS sources,
        count(*)::int AS event_count,
        count(*) FILTER (WHERE a.resolved_actor_uid IS NOT NULL OR a.resolved_actor_email IS NOT NULL)::int AS attributed_events,
        count(*) FILTER (WHERE a.source IS NULL OR a.source='' OR a.source='unknown')::int AS unknown_events,
        min(a.occurred_at)::text AS first_at,max(a.occurred_at)::text AS last_at
      FROM day_events a GROUP BY a.entity_type,a.entity_id
    )
    SELECT g.*,
      COALESCE(NULLIF(BTRIM(p.display_name),''),NULLIF(BTRIM(CONCAT_WS(' ',p.first_name,p.last_name)),'')) AS player_name,
      NULLIF(BTRIM(s.hsname),'') AS school_name
    FROM grouped g
    LEFT JOIN public.flip_card_front_stage p ON p.playerid=g.playerid
    LEFT JOIN public.tbc_schools_raw s ON s.hsid=CASE
      WHEN g.hsid ~ '^[0-9]{1,9}$' THEN g.hsid::integer
      WHEN p.hsid ~ '^[0-9]{1,9}$' THEN p.hsid::integer
      ELSE NULL END
    ORDER BY g.last_at DESC`);

    // Explicitly surface unknown sources, manual/photo submissions, and cleared statuses,
    // even if a later automated job reverses them before midnight.
    const { rows: exceptionalEvents } = await query<ExceptionalEvent>(`SELECT
      a.entity_type,a.entity_id,a.playerid,a.hsid,a.source,a.occurred_at::text,
      a.before_data,a.after_data,
      COALESCE(a.actor_uid,fa.firebase_uid) AS actor_uid,
      COALESCE(a.actor_email,u.email) AS actor_email,
      COALESCE(NULLIF(BTRIM(p.display_name),''),NULLIF(BTRIM(CONCAT_WS(' ',p.first_name,p.last_name)),'')) AS player_name,
      NULLIF(BTRIM(s.hsname),'') AS school_name
    FROM public.contribution_change_audit a
    LEFT JOIN LATERAL (
      SELECT f.firebase_uid FROM public.fan_activity f
      WHERE a.entity_type='photo' AND f.action LIKE 'contribute_photo%'
        AND f.details->>'upload_id'=a.entity_id
      ORDER BY f.created_at DESC LIMIT 1
    ) fa ON TRUE
    LEFT JOIN public.user_profiles u ON u.firebase_uid=COALESCE(a.actor_uid,fa.firebase_uid)
    LEFT JOIN public.flip_card_front_stage p ON p.playerid=a.playerid
    LEFT JOIN public.tbc_schools_raw s ON s.hsid=CASE
      WHEN a.hsid ~ '^[0-9]{1,9}$' THEN a.hsid::integer
      WHEN p.hsid ~ '^[0-9]{1,9}$' THEN p.hsid::integer
      ELSE NULL END
    WHERE ${dayFilter} AND (
      a.source IS NULL OR a.source='' OR a.source='unknown'
      OR a.actor_uid IS NOT NULL OR a.actor_email IS NOT NULL
      OR a.entity_type='photo'
      OR (a.before_data->>'status' IS NOT NULL AND a.after_data->>'status' IS NULL)
    ) ORDER BY a.occurred_at DESC,a.id DESC`);

    const { rows: sourceCounts } = await query<SourceCount>(`SELECT COALESCE(NULLIF(a.source,''),'unknown') AS source,
      count(*)::int AS events FROM public.contribution_change_audit a
      WHERE ${dayFilter} GROUP BY 1 ORDER BY 2 DESC`);

    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(Date.now() - 86400000));
    const digest = buildAuditEmail(date, groups, exceptionalEvents, sourceCounts);
    const contact = await findOrCreateGhlContact('pete@yatstats.com', 'Pete', 'DeLuca', undefined, 'YAT?STATS Operations');
    if (!contact) throw Error('Unable to resolve daily audit email contact');
    const sent = await sendGHLEmail(contact, digest.subject, digest.html);
    if (!sent) throw Error('Daily audit email was not sent');
    return NextResponse.json({ ok: true, day: date, logged: digest.totalEvents,
      net: digest.netCount, reverted: digest.revertedCount, review: digest.reviewCount });
  } catch (error) {
    console.error('[contribution-audit-digest]', error);
    return NextResponse.json({ ok: false, error: 'Audit email failed' }, { status: 500 });
  }
}
