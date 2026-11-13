// src/app/api/player-connect-video/route.ts
// The player's outgoing "personal message" video (CONNECT tab).
//
//   GET  ?playerId=…          the live video, if any (public, cached briefly)
//   GET  ?playerId=…&me=1     + whether the signed-in viewer may upload
//   POST {action:'sign', playerId, contentType}   signed S3 form for a new file
//   POST {action:'publish', playerId, key}       make the uploaded file live
//   POST {action:'remove', playerId}             take the video down
//
// Uploading and removing are for reviewers (CONTRIBUTE_REVIEWER_EMAILS)
// until players can manage their own videos.
import { NextRequest, NextResponse } from 'next/server';
import { contributionsToday, identifyContributor, isReviewer, logContribution } from '@/lib/contributeServer';
import {
  CONNECT_VIDEO_MAX_BYTES,
  CONNECT_VIDEO_TYPES,
  getConnectVideo,
  publishConnectVideo,
  removeConnectVideo,
  signConnectVideoUpload,
  validPlayerId,
  signPendingIntroUpload,
  submitPendingIntro,
  listPendingIntros,
  reviewPendingIntro,
} from '@/lib/playerConnectVideo';

export const runtime = 'nodejs';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest) {
  const pid = validPlayerId(req.nextUrl.searchParams.get('playerId'));
  if (!pid) return fail('Missing player.');
  const me = req.nextUrl.searchParams.get('me') === '1';
  let video = null;
  try {
    video = await getConnectVideo(pid);
  } catch (error) {
    console.error('[connect-video] read failed', error);
  }
  if (!me) {
    return NextResponse.json({ video }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } });
  }
  const who = await identifyContributor(req, req.headers.get('x-firebase-token')).catch(() => null);
  if(req.nextUrl.searchParams.get('review') === '1') {
    if(!isReviewer(who))return fail('Reviewer access required.',403);
    return NextResponse.json({ submissions: await listPendingIntros() }, { headers: { 'Cache-Control':'no-store' } });
  }
  return NextResponse.json({ video, canUpload: isReviewer(who) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const pid = validPlayerId(body?.playerId);
  if (!pid) return fail('Missing player.');
  const who = await identifyContributor(req, req.headers.get('x-firebase-token')).catch(() => null);
  if (!who) return fail('Please sign in.', 401);
  // Anyone signed in may propose an introductory video, but only a reviewer
  // may publish it. The self-selected player record is not identity proof.
  if(body.action === 'sign-intro') {
    if(await contributionsToday(who.uid)>=3)return fail('Daily contribution limit reached. Please try tomorrow.',429);
    const contentType=String(body.contentType||'').toLowerCase();
    if(!CONNECT_VIDEO_TYPES[contentType])return fail('Choose an MP4, MOV or WebM video.');
    const size=Number(body.size);
    if(!Number.isFinite(size)||size<=0||size>CONNECT_VIDEO_MAX_BYTES)
      return fail('Video must be under 500 MB.',413);
    return NextResponse.json(signPendingIntroUpload(pid,who.uid,contentType),{headers:{'Cache-Control':'no-store'}});
  }
  if(body.action === 'submit-intro') {
    if(await contributionsToday(who.uid)>=3)return fail('Daily contribution limit reached. Please try tomorrow.',429);
    const item=await submitPendingIntro(pid,who.uid,String(body.key||''));
    if(!item)return fail('Video did not reach storage or does not belong to this account.',409);
    await logContribution(who,'contribute_connect_intro_pending',{
      playerid:pid,pageUrl:null,details:{submission:item.id,key:item.key},
    });
    return NextResponse.json({submitted:true,reviewId:item.id},{headers:{'Cache-Control':'no-store'}});
  }
  if(body.action === 'review-intro') {
    if(!isReviewer(who))return fail('Reviewer access required.',403);
    const decision=body.decision==='approve'?'approve':body.decision==='reject'?'reject':null;
    if(!decision)return fail('Choose approve or reject.');
    const item=await reviewPendingIntro(String(body.reviewId||''),decision,who.email);
    await logContribution(who,`contribute_connect_intro_${decision}`,{
      playerid:item.playerId,pageUrl:null,details:{reviewId:item.id,key:item.key},
    });
    return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  }
  if (!isReviewer(who)) return fail('Only YAT?STATS reviewers can publish player videos.', 403);

  try {
    if (body.action === 'sign') {
      const contentType = String(body.contentType || '').toLowerCase();
      if (!CONNECT_VIDEO_TYPES[contentType]) return fail('Please choose an MP4, MOV or WebM video.');
      if (Number(body.size) > CONNECT_VIDEO_MAX_BYTES) return fail('That video is over 500 MB. Please trim or compress it.', 413);
      return NextResponse.json(signConnectVideoUpload(pid, contentType), { headers: { 'Cache-Control': 'no-store' } });
    }
    if (body.action === 'publish') {
      const video = await publishConnectVideo(pid, String(body.key || ''), who.email);
      if (!video) return fail('The upload did not reach storage. Please try again.', 409);
      await logContribution(who, 'contribute_connect_video', { playerid: pid, pageUrl: null, details: { key: video.key } });
      return NextResponse.json({ video }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (body.action === 'remove') {
      await removeConnectVideo(pid);
      await logContribution(who, 'contribute_connect_video_removed', { playerid: pid, pageUrl: null, details: {} });
      return NextResponse.json({ video: null }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return fail('Unknown action.');
  } catch (error) {
    console.error('[connect-video] POST failed', error);
    return fail('Something went wrong. Please try again.', 500);
  }
}
