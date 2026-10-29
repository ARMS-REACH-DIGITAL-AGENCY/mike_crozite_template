// src/app/api/contribute/review/route.ts
// Connect & Contribute review queue, for the reviewers in
// CONTRIBUTE_REVIEWER_EMAILS only.
//
//   GET                       -> pending photos, latest corrections/tips,
//                                latest missing-player reports
//   POST { id, action }       -> approve | reject a photo. Approving copies
//                                it to the files the site reads (see
//                                promoteUpload) - the only way a fan's photo
//                                ever reaches a card.
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { COLLEGE_COMMIT_LEVELS } from '@/lib/collegeCommitments';
import { publishCurrentTeamChange, resolveCanonicalCurrentTeam } from '@/lib/publishCurrentTeamChange';
import { revalidateTag } from 'next/cache';
import { assetUrl, existingPublishedTarget, identifyContributor, isReviewer, notifyContributor, promoteUpload, type UploadRow } from '@/lib/contributeServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function reviewer(req: NextRequest, idToken?: string | null) {
  const who = await identifyContributor(req, idToken || req.headers.get('x-firebase-token'));
  if (!who) return { error: fail('Please sign in.', 401) };
  if (!isReviewer(who)) return { error: fail('This page is for YAT?STATS reviewers.', 403) };
  return { who };
}

export async function GET(req: NextRequest) {
  const r = await reviewer(req);
  if (r.error) return r.error;
  try {
    const [photos, tips, missing] = await Promise.all([
      query<UploadRow & { description: string | null; uploaded_at: string; player_name: string | null; school_name: string | null }>(
        `SELECT m.id::text, m.playerid, m.hsid, m.purpose, m.s3_key, m.date_taken, m.description, m.uploaded_at,
                NULLIF(TRIM(COALESCE(f.first_name, '') || ' ' || COALESCE(f.last_name, '')), '') AS player_name,
                s.hsname AS school_name
           FROM media_upload m
           LEFT JOIN LATERAL (SELECT first_name, last_name FROM flip_card_front_stage
                               WHERE playerid::text = m.playerid LIMIT 1) f ON true
           LEFT JOIN LATERAL (SELECT hsname FROM school_success WHERE hsid::text = m.hsid LIMIT 1) s ON true
          WHERE m.status = 'pending' AND m.s3_key LIKE 'staging/contribute/%'
          ORDER BY m.uploaded_at ASC LIMIT 100`
      ),
      query(
        `SELECT q.id::text, q.submitted_at, q.intake_source, q.sender_name, q.raw_player_name, q.matched_playerid, q.matched_hsid,
                q.article_url, q.notes, COALESCE(audit.status, q.status) AS status
           FROM news_tip_queue q
           LEFT JOIN LATERAL (
             SELECT fa.details->>'status' AS status FROM fan_activity fa
             WHERE fa.action = 'contribute_processed'
               AND fa.firebase_uid IN ('system:contribution-publisher','system:contribution-review')
               AND fa.details->>'queue_id' = q.id::text
             ORDER BY fa.created_at DESC LIMIT 1
           ) audit ON true
          WHERE q.intake_source IN ('correction', 'fan_drawer', 'social_scout')
          ORDER BY q.submitted_at DESC LIMIT 100`
      ),
      query(
        `SELECT p.id::text, p.created_at, p.hsid, p.player_name, p.grad_year, p.notes, s.hsname AS school_name
           FROM missing_player_submission p
           LEFT JOIN LATERAL (SELECT hsname FROM school_success WHERE hsid::text = p.hsid LIMIT 1) s ON true
          ORDER BY p.created_at DESC LIMIT 100`
      ),
    ]);
    return NextResponse.json({
      photos: photos.rows.map((p) => {
        let details: Record<string, unknown> = {};
        try { details = JSON.parse(p.description || '{}'); } catch {}
        return { ...p, url: assetUrl(p.s3_key), details };
      }),
      tips: tips.rows,
      missing: missing.rows,
    });
  } catch (error) {
    console.error('[contribute/review] GET failed', error);
    return fail('The review queue could not be loaded.', 500);
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Nothing arrived.');
  }
  const r = await reviewer(req, String(body.idToken || ''));
  if (r.error) return r.error;
  const id = String(body.id || '');
  const action = String(body.action || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('Unknown request.');
  if (action === 'approve_scout' || action === 'reject_scout') {
    if (process.env.VERCEL_ENV === 'preview') return fail('Scout approvals are disabled on previews.', 409);
    try {
      const {rows}=await query<{
        id:string; matched_playerid:string; matched_hsid:string; raw_player_name:string;
        article_url:string; notes:string; status:string;
      }>(`SELECT id::text, matched_playerid, matched_hsid, raw_player_name,
             article_url, notes, status FROM news_tip_queue
          WHERE id::text=$1 AND intake_source='social_scout' LIMIT 1`,[id]);
      const tip=rows[0];
      if(!tip || tip.status!=='needs_review') return fail('Scout candidate was not found.',404);
      const {rows:previous}=await query<{status:string}>(`SELECT details->>'status' AS status
        FROM fan_activity WHERE action='contribute_processed'
          AND details->>'queue_id'=$1 ORDER BY created_at DESC LIMIT 1`,[id]);
      if(previous.length) return fail('Already reviewed.',409);
      if(action==='approve_scout'){
        const {rows:player}=await query<{playerid:string;hsid:string;first_name:string;last_name:string}>(`
          SELECT playerid,hsid,first_name,last_name FROM flip_card_front_stage
          WHERE playerid=$1 AND hsid=$2 LIMIT 1`,[tip.matched_playerid,tip.matched_hsid]);
        if(!player[0]) return fail('Player is no longer associated with the school.',409);
        const meta=JSON.parse(tip.notes || '{}') as {title?:string;captionExcerpt?:string};
        const url=new URL(tip.article_url);
        if(url.protocol!=='https:' || url.hostname!=='www.instagram.com' ||
          !/^\\/(?:p|reel)\\/[A-Za-z0-9_-]{5,32}\\/$/.test(url.pathname)) return fail('Invalid original Instagram URL.',409);
        const code=url.pathname.split('/')[2];
        const {rows:existing}=await query<{uuid:string}>(`
          SELECT uuid FROM news_articles WHERE hsid=$1 AND playerid=$2
             AND strpos(url,$3)>0 LIMIT 1`,[tip.matched_hsid,tip.matched_playerid,code]);
        if(existing.length) return fail('This post is already published.',409);
        await query(`
          INSERT INTO news_articles(uuid,playerid,player_name,hsid,title,source,
            published_at,url,snippet,local_recap,discovery_source,verification_status,
            verification_reason,newsworthiness,raw_payload)
          VALUES(md5($1),$2,$3,$4,$5,'instagram.com',now(),$6,$7,$7,
            'social_scout','VERIFIED','Reviewer approved public original Instagram post',
            'NORMAL',$8::jsonb)
          ON CONFLICT(uuid) DO NOTHING`,
          [id,tip.matched_playerid,`${player[0].first_name} ${player[0].last_name}`,
            tip.matched_hsid,String(meta.title || 'Player news').slice(0,180),
            tip.article_url,String(meta.captionExcerpt || '').slice(0,350),
            JSON.stringify({contribution_id:id,contributor_source:'social_scout',approved_by:r.who!.uid})]);
      }
      await query(`INSERT INTO fan_activity(firebase_uid,action,playerid,hsid,details)
        VALUES($1,'contribute_processed',$2,$3,
          jsonb_build_object('queue_id',$4::text,'status',$5::text,'reason','Social scout reviewed'))`,
        [r.who!.uid,tip.matched_playerid,tip.matched_hsid,id,action==='approve_scout'?'published':'rejected']);
      if(action==='approve_scout') revalidateTag(`school-data:${tip.matched_hsid}`,{expire:0});
      return NextResponse.json({ok:true,status:action==='approve_scout'?'published':'rejected'});
    } catch(error) {
      console.error('[contribute/review] scout review failed',error);
      return fail('Scout candidate review failed.',500);
    }
  }
  if (action === 'approve_team' || action === 'reject_team') {
    if (process.env.VERCEL_ENV === 'preview') {
      return fail('Current-team approval is disabled on preview deployments.', 409);
    }
    try {
      const { rows } = await query<{
        matched_playerid: string | null;
        matched_hsid: string | null;
        notes: string | null;
        status: string;
        review_state: string | null;
      }>(`SELECT q.matched_playerid, q.matched_hsid, q.notes, q.status,
          (SELECT fa.details->>'status' FROM fan_activity fa
           WHERE fa.action='contribute_processed'
             AND fa.details->>'queue_id'=q.id::text
           ORDER BY fa.created_at DESC LIMIT 1) AS review_state
          FROM news_tip_queue q WHERE q.id::text=$1 AND q.intake_source='correction' LIMIT 1`, [id]);
      const item=rows[0];
      if (!item?.matched_playerid || !item.matched_hsid) return fail('Team-change submission was not found.',404);
      if (['published','rejected'].includes(item.review_state || item.status || '')) {
        return fail('This submission has already been reviewed.',409);
      }
      let details: Record<string,unknown>;
      try { details=JSON.parse(item.notes || '{}'); } catch { return fail('Invalid submission details.'); }
      const fields=details.fields && typeof details.fields==='object' && !Array.isArray(details.fields)
        ? details.fields as Record<string,unknown> : {};
      if (details.kind!=='profile_update' || details.playerId!==item.matched_playerid ||
          details.hsid!==item.matched_hsid ||
          Object.keys(fields).sort().join(',')!=='current_team_name,current_teamid,level_label,status_label' ||
          fields.status_label!=='ACTIVE' || typeof fields.current_teamid!=='string' ||
          !/^\d{1,18}$/.test(fields.current_teamid)) {
        return fail('This correction requires a separate review workflow.',409);
      }
      if (action==='reject_team') {
        await query(`INSERT INTO fan_activity(firebase_uid,action,playerid,hsid,details)
          VALUES('system:contribution-review','contribute_processed',$1,$2,
            jsonb_build_object('queue_id',$3::text,'status','rejected','reason','Reviewer rejected current-team change'))`,
          [item.matched_playerid,item.matched_hsid,id]);
        return NextResponse.json({ok:true,status:'rejected'});
      }
      const team=await resolveCanonicalCurrentTeam(fields.current_teamid);
      if (!team) return fail('The selected team no longer has a valid canonical ID.',409);
      const published=await publishCurrentTeamChange({
        playerId:item.matched_playerid,hsid:item.matched_hsid,
        team,reviewerUid:r.who!.uid,reviewedFanSuggestion:true,contributionQueueId:id,
      });
      if (!published) return fail('Player not found. Reload and verify the correction.',409);
      return NextResponse.json({ok:true,status:'published',playerId:item.matched_playerid,
        teamId:team.teamId,teamName:team.name});
    } catch (error) {
      console.error('[contribute/review] current-team review failed',error);
      return fail('Current-team review could not be completed.',500);
    }
  }
  if (action === 'approve_commit' || action === 'reject_commit') {
    // Commitment test submissions in preview must never mutate the shared DB.
    if (process.env.VERCEL_ENV === 'preview') return fail('Commitment approval is disabled on preview deployments.', 409);
    try {
      const {rows: queue}=await query<{
        matched_playerid:string|null; matched_hsid:string|null; notes:string|null;
        review_state:string|null;
      }>(`SELECT q.matched_playerid, q.matched_hsid, q.notes,
              (SELECT fa.details->>'status' FROM fan_activity fa
               WHERE fa.action='contribute_processed'
                 AND fa.details->>'queue_id'=q.id::text
               ORDER BY fa.created_at DESC LIMIT 1) AS review_state
          FROM news_tip_queue q WHERE q.id::text=$1 AND q.intake_source='correction' LIMIT 1`,[id]);
      const item=queue[0];
      if (!item?.matched_playerid || !item.matched_hsid) return fail('Commitment submission was not found.',404);
      if (['published','rejected'].includes(item.review_state || '')) return fail('This submission was already reviewed.',409);
      let details:Record<string,unknown>={};
      try { details=JSON.parse(item.notes || '{}'); } catch { return fail('Invalid submission details.'); }
      const fields=details.fields && typeof details.fields==='object' && !Array.isArray(details.fields)
        ? details.fields as Record<string,unknown> : {};
      // Only an explicit two-field commitment submission can change the roster.
      if (details.kind!=='profile_update' || details.playerId!==item.matched_playerid ||
          details.hsid!==item.matched_hsid ||
          Object.keys(fields).sort().join(',')!=='committed_teamid,status_label' ||
          typeof fields.committed_teamid!=='string') {
        return fail('This correction requires a separate review workflow.',409);
      }
      const nextStatus=String(fields.status_label || '');
      const nextTeamId=fields.committed_teamid.trim();
      if (!['COMMIT','UNCOMMITTED'].includes(nextStatus) ||
          (nextStatus==='COMMIT' && !/^\d{1,18}$/.test(nextTeamId)) ||
          (nextStatus==='UNCOMMITTED' && nextTeamId!=='')) return fail('Invalid commitment details.');
      const {rows: currentRows}=await query<{
        playerid:string; hsid:string; player_level:string|null; status_label:string|null; committed_teamid:string|null;
      }>(`SELECT playerid::text, hsid::text,
                 COALESCE(NULLIF(TRIM(display_level_label),''),level_label) AS player_level,
                 status_label, committed_teamid
            FROM flip_card_front_stage WHERE playerid=$1 AND hsid::text=$2 LIMIT 1`,
        [item.matched_playerid,item.matched_hsid]);
      const current=currentRows[0];
      if (!current || String(current.player_level||'').trim().toUpperCase()!=='HIGH SCHOOL' ||
          /COACH/i.test(String(current.status_label||''))) {
        return fail('This player is not currently eligible for a high-school commitment update.',409);
      }
      if (action==='reject_commit') {
        await query(`INSERT INTO fan_activity(firebase_uid,action,playerid,hsid,details)
          VALUES('system:contribution-review','contribute_processed',$1,$2,
            jsonb_build_object('queue_id',$3::text,'status','rejected','reason','Reviewer rejected commitment'))`,
          [current.playerid,current.hsid,id]);
        return NextResponse.json({ok:true,status:'rejected'});
      }
      if (nextStatus==='COMMIT') {
        const {rows: teams}=await query<{teamid:string}>(`SELECT teamid FROM teamid_universe_mapping
          WHERE teamid=$1 AND UPPER(TRIM(COALESCE(level_label,'')))=ANY($2::text[])
            AND COALESCE(TRIM(current_team_name),'')<>'' LIMIT 1`,
          [nextTeamId,[...COLLEGE_COMMIT_LEVELS]]);
        if (!teams[0]) return fail('The selected college is not valid.',409);
      }
      // Update stage data and append the review audit atomically. A change to
      // the player since the reviewer loaded the page fails the compare-and-set.
      const {rows: published}=await query<{playerid:string}>(`
        WITH updated AS (
          UPDATE flip_card_front_stage
          SET status_label=$1, display_status_label=$1, committed_teamid=$2, updated_at=now()
          WHERE playerid=$3 AND hsid::text=$4
            AND COALESCE(status_label,'')=$5 AND COALESCE(committed_teamid,'')=$6
            AND UPPER(TRIM(COALESCE(NULLIF(TRIM(display_level_label),''),level_label,'')))='HIGH SCHOOL'
            AND UPPER(COALESCE(status_label,'')) NOT LIKE '%COACH%'
          RETURNING playerid,hsid
        ), audited AS (
          INSERT INTO fan_activity(firebase_uid,action,playerid,hsid,details)
          SELECT 'system:contribution-review','contribute_processed',playerid,hsid,
            jsonb_build_object('queue_id',$7::text,'status','published',
              'reason','Reviewer approved college commitment','status_label',$1::text,'committed_teamid',$2::text)
          FROM updated RETURNING playerid
        )
        SELECT playerid FROM audited
      `,[nextStatus,nextStatus==='COMMIT'?nextTeamId:null,current.playerid,current.hsid,
         current.status_label || '',current.committed_teamid || '',id]);
      if (!published[0]) return fail('Player data changed during review. Reload and verify before approving.',409);
      revalidateTag(`school-data:${current.hsid}`,{expire:0});
      return NextResponse.json({ok:true,status:'published',playerId:published[0].playerid});
    } catch (error) {
      console.error('[contribute/review] commitment review failed',error);
      return fail('Commitment review could not be completed.',500);
    }
  }
  if (!['approve','reject'].includes(action)) return fail('Unknown request.');
  try {
    const { rows } = await query<UploadRow & { status: string }>(
      `SELECT id::text, playerid, hsid, purpose, s3_key, date_taken, team_at_time, description, status FROM media_upload WHERE id = $1`,
      [id]
    );
    const upload = rows[0];
    if (!upload) return fail('That photo was not found.', 404);
    if (upload.status !== 'pending') return fail(`Already ${upload.status}.`, 409);
    // Who sent it, and from where, to tell them (notifyContributor).
    let details: { by?: { email?: string; name?: string }; playerName?: string; pageUrl?: string } = {};
    try { details = JSON.parse(String((upload as { description?: string }).description || '{}')); } catch {}
    const photo = {
      purpose: upload.purpose,
      playerId: upload.playerid,
      playerName: details.playerName || null,
      hsid: upload.hsid,
      year: upload.date_taken ? new Date(upload.date_taken).getUTCFullYear() : null,
      pageUrl: details.pageUrl || null,
    };
    if (action === 'approve') {
      const existing = await existingPublishedTarget(upload);
      if (existing) return fail('This slot already contains a published image. Replacement requires a separate explicit workflow.', 409);
      const written = await promoteUpload(upload);
      await query(`UPDATE media_upload SET status = 'approved', description = $2 WHERE id = $1`,
        [id, JSON.stringify({ ...details, published_assets: written, manual_review: { approved_at: new Date().toISOString() } })]);
      await notifyContributor(details.by, 'posted', photo);
      return NextResponse.json({ ok: true, status: 'approved', written });
    }
    await query(`UPDATE media_upload SET status = 'rejected' WHERE id = $1`, [id]);
    await notifyContributor(details.by, 'declined', { ...photo, reason: typeof body.reason === 'string' ? body.reason.slice(0, 300) : null });
    return NextResponse.json({ ok: true, status: 'rejected' });
  } catch (error) {
    console.error('[contribute/review] POST failed', error);
    return fail(error instanceof Error ? error.message : 'That did not work.', 500);
  }
}
