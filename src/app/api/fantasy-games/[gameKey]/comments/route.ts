import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { identifyFan, viewerUid } from '@/lib/fanIdentity';
import { ensureFantasyGameSocialTables, GAME_COMMENT_MAX, gameKey } from '@/lib/fantasyGameSocial';
import { NotAnImageError, STORY_MAX_PHOTO_BYTES, STORY_MAX_PHOTOS, storeStoryPhoto, storyAssetUrl } from '@/lib/stories';

export const runtime='nodejs';

type Row={id:string;body:string;created_at:string;firebase_uid:string;first_name:string|null;last_name:string|null;photos:any[]|null};

function out(r:Row,viewer:string|null){
  return {id:r.id,text:r.body,createdAt:r.created_at,
    author:[r.first_name,r.last_name].map(v=>String(v||'').trim()).filter(Boolean).join(' ')||'A YAT?STATS fan',
    isMine:Boolean(viewer&&r.firebase_uid===viewer),
    photos:(r.photos||[]).map((p:any)=>({web:storyAssetUrl(p.web),thumb:storyAssetUrl(p.thumb),full:storyAssetUrl(p.full),width:p.width,height:p.height}))
  };
}

export async function POST(req:NextRequest,{params}:{params:Promise<{gameKey:string}>}){
  const key=gameKey(decodeURIComponent((await params).gameKey||''));
  if(!key) return NextResponse.json({error:'Game not found.'},{status:404});
  const fan=await identifyFan(req);
  if(!fan) return NextResponse.json({error:'Sign in to comment.'},{status:401});

  let text='',photos:File[]=[];
  if((req.headers.get('content-type')||'').includes('multipart/form-data')){
    let form:FormData; try{form=await req.formData();}catch{return NextResponse.json({error:'Upload incomplete.'},{status:413});}
    text=String(form.get('text')??'').trim();
    photos=form.getAll('photos').filter((f):f is File=>f instanceof File&&f.size>0);
  } else {
    const body=await req.json().catch(()=>({})) as {text?:unknown};
    text=String(body.text??'').trim();
  }
  if(!text&&!photos.length) return NextResponse.json({error:'Write a comment or add a photo first.'},{status:400});
  if(text.length>GAME_COMMENT_MAX) return NextResponse.json({error:`Please keep comments under ${GAME_COMMENT_MAX.toLocaleString()} characters.`},{status:400});
  if(photos.length>STORY_MAX_PHOTOS) return NextResponse.json({error:`Up to ${STORY_MAX_PHOTOS} photos per comment.`},{status:400});
  if(photos.some(f=>f.size>STORY_MAX_PHOTO_BYTES)) return NextResponse.json({error:'One of the photos is too large.'},{status:413});

  try{
    await ensureFantasyGameSocialTables();
    const folder=`fantasy-game-${randomUUID()}`,stored:any[]=[];
    for(let i=0;i<photos.length;i++) stored.push(await storeStoryPhoto(folder,i,Buffer.from(await photos[i].arrayBuffer())));
    const {rows}=await query<Row>(`
      with c as (
        insert into fantasy_game_comments(game_key,firebase_uid,body) values($1,$2,$3)
        returning id,body,created_at,firebase_uid
      ), p as (
        insert into fantasy_game_comment_photos(comment_id,sort_order,s3_key,web_s3_key,thumb_s3_key,width,height,mime_type,file_size_bytes)
        select c.id,p.ord,p.s3_key,p.web_s3_key,p.thumb_s3_key,p.width,p.height,p.mime_type,p.file_size_bytes
        from c,jsonb_to_recordset($4::jsonb) as p(ord int,s3_key text,web_s3_key text,thumb_s3_key text,width int,height int,mime_type text,file_size_bytes bigint)
      )
      select c.id::text id,c.body,c.created_at,c.firebase_uid,up.first_name,up.last_name,
        (select json_agg(json_build_object('web',p.web_s3_key,'thumb',p.thumb_s3_key,'full',p.s3_key,'width',p.width,'height',p.height) order by p.ord)
         from jsonb_to_recordset($4::jsonb) as p(ord int,s3_key text,web_s3_key text,thumb_s3_key text,width int,height int)) photos
      from c left join lateral(select first_name,last_name from user_profiles where firebase_uid=c.firebase_uid limit 1) up on true
    `,[key,fan.uid,text,JSON.stringify(stored.map((p,i)=>({ord:i,...p})))]);
    return NextResponse.json({comment:out(rows[0],fan.uid)},{status:201});
  } catch(error){
    if(error instanceof NotAnImageError) return NextResponse.json({error:error.message},{status:400});
    console.error('[fantasy-game] comment failed',error);
    return NextResponse.json({error:'Your comment could not be posted.'},{status:500});
  }
}

export async function GET(req:NextRequest,{params}:{params:Promise<{gameKey:string}>}){
  const key=gameKey(decodeURIComponent((await params).gameKey||'')); if(!key) return NextResponse.json({comments:[]});
  try{
    await ensureFantasyGameSocialTables();
    const {rows}=await query<Row>(`
      select c.id::text id,c.body,c.created_at,c.firebase_uid,up.first_name,up.last_name,
      (select json_agg(json_build_object('web',p.web_s3_key,'thumb',p.thumb_s3_key,'full',p.s3_key,'width',p.width,'height',p.height) order by p.sort_order,p.id)
       from fantasy_game_comment_photos p where p.comment_id=c.id) photos
      from fantasy_game_comments c left join lateral(select first_name,last_name from user_profiles where firebase_uid=c.firebase_uid limit 1) up on true
      where c.game_key=$1 and c.status='visible' order by c.created_at,c.id limit 500`,[key]);
    const viewer=viewerUid(req);
    return NextResponse.json({comments:rows.map(r=>out(r,viewer))},{headers:{'Cache-Control':'no-store'}});
  }catch(error){console.error('[fantasy-game] comments failed',error);return NextResponse.json({error:'Comments could not load.'},{status:500});}
}
