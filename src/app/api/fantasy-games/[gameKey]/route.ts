import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { likerKey, identifyFan, viewerUid } from '@/lib/fanIdentity';
import { ensureFantasyGameSocialTables, gameKey } from '@/lib/fantasyGameSocial';
import { storyAssetUrl } from '@/lib/stories';

export const runtime = 'nodejs';

type Row = {
  id: string; body: string; created_at: string; firebase_uid: string;
  first_name: string | null; last_name: string | null;
  photos: Array<{ web:string|null; thumb:string|null; full:string|null; width:number|null; height:number|null }> | null;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ gameKey: string }> }) {
  const key = gameKey(decodeURIComponent((await params).gameKey || ''));
  if (!key) return NextResponse.json({ error:'Game not found.' }, { status:404 });
  try {
    await ensureFantasyGameSocialTables();
    const fan = await identifyFan(req);
    const viewer = viewerUid(req);
    const liker = likerKey(req, fan?.uid);
    const [{ rows: countRows }, { rows: comments }] = await Promise.all([
      query<{ like_count:number; comment_count:number; liked:boolean }>(
        `select
          (select count(*)::int from fantasy_game_likes where game_key=$1) like_count,
          (select count(*)::int from fantasy_game_comments where game_key=$1 and status='visible') comment_count,
          exists(select 1 from fantasy_game_likes where game_key=$1 and liker_uid=$2) liked`,
        [key, liker || '']
      ),
      query<Row>(
        `select c.id::text id,c.body,c.created_at,c.firebase_uid,up.first_name,up.last_name,
          (select json_agg(json_build_object('web',p.web_s3_key,'thumb',p.thumb_s3_key,'full',p.s3_key,'width',p.width,'height',p.height) order by p.sort_order,p.id)
             from fantasy_game_comment_photos p where p.comment_id=c.id) photos
         from fantasy_game_comments c
         left join lateral (select first_name,last_name from user_profiles where firebase_uid=c.firebase_uid limit 1) up on true
         where c.game_key=$1 and c.status='visible' order by c.created_at,c.id limit 500`,
        [key]
      )
    ]);
    const counts=countRows[0] || {like_count:0,comment_count:0,liked:false};
    return NextResponse.json({
      likeCount:counts.like_count||0, commentCount:counts.comment_count||0, liked:Boolean(counts.liked),
      comments:comments.map(r=>({
        id:r.id,text:r.body,createdAt:r.created_at,
        author:[r.first_name,r.last_name].map(v=>String(v||'').trim()).filter(Boolean).join(' ')||'A YAT?STATS fan',
        isMine:Boolean(viewer && r.firebase_uid===viewer),
        photos:(r.photos||[]).map(p=>({web:storyAssetUrl(p.web),thumb:storyAssetUrl(p.thumb),full:storyAssetUrl(p.full),width:p.width,height:p.height}))
      }))
    },{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    console.error('[fantasy-game] state failed',error);
    return NextResponse.json({error:'Game activity could not load.'},{status:500});
  }
}
