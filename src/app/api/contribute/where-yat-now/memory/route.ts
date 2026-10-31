import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { query } from '@/lib/db';
import { identifyContributor } from '@/lib/contributeServer';
import { moderateContributedTip } from '@/lib/contributeTipModeration';
import { moderatePhoto } from '@/lib/contributeModeration';
import { storeStoryPhoto, STORY_MAX_PHOTO_BYTES, storyAssetUrl } from '@/lib/stories';

export const runtime='nodejs';
export const maxDuration=60;
const columns={favoriteHs:'favorite_hs_memory',favoriteAfter:'favorite_post_hs_memory',family:'family_life',story:'story',business:'business_message'} as const;
type Key=keyof typeof columns;
type Photo={web:string;full:string;thumb:string};
const bad=(error:string,status=400)=>NextResponse.json({error},{status});

export async function PATCH(req:NextRequest){
 const who=await identifyContributor(req,req.headers.get('x-firebase-token'));
 if(!who)return bad('Sign in to edit your memory.',401);
 const data=await req.formData().catch(()=>null);
 if(!data)return bad('Unable to read this memory.');
 const id=Number(data.get('submissionId'));
 const key=String(data.get('storyKey')||'') as Key;
 const story=String(data.get('story')||'').trim();
 if(!Number.isSafeInteger(id)||id<=0||!Object.prototype.hasOwnProperty.call(columns,key))return bad('Invalid memory.');
 if(!story||story.length>5000)return bad('A memory must contain text of 5,000 characters or less.');
 const found=await query<{id:number;contributor_uid:string;memory_photos_json:Record<string,Photo[]>|null;life_photos_json:Photo[]|null;photo_url:string|null}>(
  "SELECT id,contributor_uid,memory_photos_json,life_photos_json,photo_url FROM public.alumni_where_yat_now WHERE id=$1 AND status='approved' AND contributor_uid=$2 LIMIT 1",
  [id,who.uid]
 );
 const current=found.rows[0];if(!current)return bad('Only the original contributor may edit this approved memory.',403);
 const existing=current.memory_photos_json||{};
 const legacy:Photo[]=key==='family'?(current.life_photos_json||[]):key==='story'&&current.photo_url?[{web:current.photo_url,full:current.photo_url,thumb:current.photo_url}]:[];
 const prior=Array.isArray(existing[key])?existing[key]:legacy;
 const keepValues=data.getAll('keepPhotos').map(String);
 const kept=prior.filter(p=>keepValues.includes(p.full));
 const files=data.getAll('photos').filter((v):v is File=>v instanceof File&&v.size>0);
 if(files.length+kept.length>4)return bad('Each memory may have up to four photos.');
 if(files.some(f=>f.size>STORY_MAX_PHOTO_BYTES||!f.type.startsWith('image/')))return bad('Choose image files under 4 MB each.',413);
 const moderation=await moderateContributedTip({url:'',title:'Retired alumni memory',description:story,playerName:null});
 if(moderation.decision!=='approve')return bad(moderation.decision==='reject'?'This text did not pass the family-safety check.':'Safety verification is unavailable. Your published memory is unchanged.',422);
 const uploaded:Photo[]=[];
 for(const [i,file] of files.entries()){
  const saved=await storeStoryPhoto(randomUUID(),i,Buffer.from(await file.arrayBuffer()));
  const photo={web:storyAssetUrl(saved.web_s3_key),full:storyAssetUrl(saved.s3_key),thumb:storyAssetUrl(saved.thumb_s3_key)};
  if(!photo.web||!photo.full||!photo.thumb)return bad('Image storage did not return a usable photo.',503);
  const verdict=await moderatePhoto({imageUrl:photo.web,purpose:'other_photo'});
  if(verdict?.decision!=='approve')return bad('A photo could not be safety-verified. Your published memory is unchanged.',422);
  uploaded.push({web:photo.web,full:photo.full,thumb:photo.thumb});
 }
 const photos={...existing,[key]:[...kept,...uploaded]};
 const column=columns[key];
 const updated=await query(`UPDATE public.alumni_where_yat_now SET ${column}=$2,memory_photos_json=$3::jsonb,memory_updated_at=now()
 WHERE id=$1 AND contributor_uid=$4 AND status='approved' RETURNING id`,[id,story,JSON.stringify(photos),who.uid]);
 if(!updated.rows.length)return bad('Memory changed before saving. Refresh and try again.',409);
 return NextResponse.json({ok:true,story,photos:photos[key]},{headers:{'Cache-Control':'no-store'}});
}
