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
import { identifyContributor, isReviewer, logContribution } from '@/lib/contributeServer';
import {
  CONNECT_VIDEO_MAX_BYTES,
  CONNECT_VIDEO_TYPES,
  getConnectVideo,
  publishConnectVideo,
  removeConnectVideo,
  signConnectVideoUpload,
  validPlayerId,
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
  return NextResponse.json({ video, canUpload: isReviewer(who) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const pid = validPlayerId(body?.playerId);
  if (!pid) return fail('Missing player.');
  const who = await identifyContributor(req, req.headers.get('x-firebase-token')).catch(() => null);
  if (!who) return fail('Please sign in.', 401);
  if (!isReviewer(who)) return fail('Only YAT?STATS can add player videos right now.', 403);

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
