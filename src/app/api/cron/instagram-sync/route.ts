import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { syncInstagramSource, type SourceResult } from '@/lib/instagramSync';
import { isGlobalInstagramFailure, type InstagramSyncErrorCategory } from '@/lib/instagramSyncHealth';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Meta Business Discovery is account-scoped and rate limited. A failed global token
// or application quota is not 40 independent failures. Stop immediately and report it.
// Last_polled_at means attempted (including failed attempts), never last success.
// Spread Meta calls across the day: two player accounts per 15-minute run,
// plus at most one school account when its 45-minute cooldown has expired.
// Schools drive coach feeds, so they need faster discovery without flooding Meta.
// Refresh existing accounts before their six-hour video URL lease expires.
const ACCOUNTS_PER_RUN = 2;
const SCHOOL_ACCOUNTS_PER_RUN = 1;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  return Boolean(expected && req.headers.get('authorization') === 'Bearer ' + expected);
}
type SyncAudit = {
  attempted: number;
  succeeded: number;
  failed: number;
  postsSeen: number;
  newImages: number;
  stoppedReason: InstagramSyncErrorCategory | 'missing_token' | null;
  failures: Array<{handle:string;category:string}>;
};
async function writeAudit(details: SyncAudit): Promise<void> {
  try {
    await pool.query(
      "INSERT INTO fan_activity(firebase_uid, action, details) VALUES ('system:instagram-sync', 'instagram_sync_run', $1::jsonb)",
      [JSON.stringify(details)]
    );
  } catch (error) {
    console.error('[instagram-sync] audit failed', error instanceof Error ? error.name : 'unknown');
  }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
  // A Vercel preview must never poll Meta, upload media, or write to production.
  if (process.env.VERCEL_ENV === 'preview') {
    return NextResponse.json({ok:true,dryRun:true,message:'Preview does not poll Meta or write records'});
  }

  if (!process.env.META_IG_ACCESS_TOKEN) {
    await writeAudit({attempted:0,succeeded:0,failed:0,postsSeen:0,newImages:0,
      stoppedReason:'missing_token',failures:[]});
    return NextResponse.json({ok:false,error:'Instagram access token is not configured',
      actionRequired:'Configure META_IG_ACCESS_TOKEN in the production environment'}, {status:503});
  }

  try {
    // Check each school-owned feed at most once per 45 minutes, in a separate
    // bounded lane. A busy player-account backlog must not delay school posts.
    // This is ownership-based, not a Hamilton/Greg-specific exception.
    const {rows:schoolSources} = await pool.query<{id:number;handle:string}>(
      "SELECT id,handle FROM social_sources WHERE platform='instagram' AND status='active' " +
      "AND owner_type='school' AND COALESCE(handle,'')<>'' " +
      "AND (last_polled_at IS NULL OR last_polled_at < now()-interval '45 minutes') " +
      "ORDER BY last_polled_at NULLS FIRST,id LIMIT $1", [SCHOOL_ACCOUNTS_PER_RUN]
    );

    // Preserve the original two-account/15-minute player rotation and
    // four-hour cooldown to avoid an unexpected Meta API quota spike.
    const {rows:rotatingSources} = await pool.query<{id:number;handle:string}>(
      "SELECT id,handle FROM social_sources WHERE platform='instagram' AND status='active' " +
      "AND owner_type<>'school' AND COALESCE(handle,'')<>'' " +
      "AND (last_polled_at IS NULL OR last_polled_at < now()-interval '4 hours') " +
      "ORDER BY last_polled_at NULLS FIRST,id LIMIT $1", [ACCOUNTS_PER_RUN]
    );
    const sources = [...schoolSources, ...rotatingSources];
    const results:SourceResult[]=[];
    let stoppedReason:InstagramSyncErrorCategory|null=null;
    for (const source of sources) {
      const result=await syncInstagramSource(pool,source);
      results.push(result);
      if (!result.ok && isGlobalInstagramFailure(result.errorCategory)) {
        stoppedReason=result.errorCategory!;
        break;
      }
    }
    const audit:SyncAudit={
      attempted:results.length,
      succeeded:results.filter(r=>r.ok).length,
      failed:results.filter(r=>!r.ok).length,
      postsSeen:results.reduce((n,r)=>n+(r.posts||0),0),
      newImages:results.reduce((n,r)=>n+(r.newImages||0),0),
      stoppedReason,
      failures:results.filter(r=>!r.ok).map(r=>({
        handle:r.handle,category:r.errorCategory||'other'
      }))
    };
    await writeAudit(audit);
    if (audit.failed) console.error('[instagram-sync] errors by category',audit.failures);
    const status=stoppedReason==='rate_limited'?429:stoppedReason==='auth_invalid'?503:200;
    return NextResponse.json({ok:audit.failed===0,eligible:sources.length,...audit,
      actionRequired:stoppedReason==='auth_invalid'?'Reauthorize Meta access and update the production token':undefined},
      {status});
  } catch (error) {
    console.error('[instagram-sync] run failed',error instanceof Error?error.name:'unknown');
    return NextResponse.json({ok:false,error:'Instagram sync failed'}, {status:500});
  }
}
