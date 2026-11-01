import {NextRequest,NextResponse} from 'next/server';
import {PutObjectCommand,S3Client} from '@aws-sdk/client-s3';
import {randomUUID} from 'crypto';
import sharp from 'sharp';
import {query} from '@/lib/db';
import {identifyContributor} from '@/lib/contributeServer';
import {S3_BUCKET,S3_REGION,storyAssetUrl} from '@/lib/storyAssets';
import {normalizeWhereYatLink} from '@/lib/whereYatLinks';
import {moderatePhoto} from '@/lib/contributeModeration';
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
export const runtime='nodejs';
export const maxDuration=60;
const keys=['favoriteHs','favoriteAfter','family','story'] as const;
export async function PATCH(req:NextRequest){
 const who=await identifyContributor(req,req.headers.get('x-firebase-token'));
 if(!who)return fail('Join or sign in to edit your flip card.',401);
 const f=await req.formData().catch(()=>null);if(!f)return fail('Could not read flip-card changes.');
 const id=Number(f.get('submissionId'));
 if(!Number.isSafeInteger(id)||id<=0)return fail('Invalid submission.');
 const found=await query<{id:number;status:string;company_logo_url:string|null;company_logo_key:string|null;business_headshot_url:string|null;business_headshot_key:string|null;favorite_hs_memory:string|null;favorite_post_hs_memory:string|null;family_life:string|null;story:string|null}>(
 "SELECT id,status,company_logo_url,company_logo_key,business_headshot_url,business_headshot_key,favorite_hs_memory,favorite_post_hs_memory,family_life,story FROM public.alumni_where_yat_now WHERE id=$1 AND contributor_uid=$2 AND status IN ('pending','approved') LIMIT 1",[id,who.uid]);
 const old=found.rows[0];if(!old)return fail('Only the original contributor can edit this card.',403);
 const txt=(name:string,len:number)=>String(f.get(name)||'').trim().slice(0,len);
 const featured=txt('featuredMemory',35);
 if(!keys.includes(featured as typeof keys[number]))return fail('Choose a valid featured memory.');
 const answer={favoriteHs:old.favorite_hs_memory,favoriteAfter:old.favorite_post_hs_memory,family:old.family_life,story:old.story}[featured as typeof keys[number]];
 if(!answer?.trim())return fail('Write the selected memory before featuring it on your card.');
 const website=normalizeWhereYatLink('website',txt('website',300));
 if(website.error)return fail(website.error);
 const social={} as Record<string,string>;
 for(const key of ['linkedin','facebook','instagram','x'] as const){const normalized=normalizeWhereYatLink(key,txt(key,300));if(normalized.error)return fail(normalized.error);social[key]=normalized.url;}
 const mail=txt('businessEmail',220),phone=txt('businessPhone',60);
 if(mail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))return fail('Enter a valid public business email.');
 const uploads:[string,string][]=[['companyLogo','logo'],['businessHeadshot','headshot']];
 const output:Record<string,{url:string;key:string}>={};
 const access=process.env.YATSTATS_AWS_ACCESS_KEY_ID||process.env.AWS_ACCESS_KEY_ID;
 const secret=process.env.YATSTATS_AWS_SECRET_ACCESS_KEY||process.env.AWS_SECRET_ACCESS_KEY;
 const s3=access&&secret?new S3Client({region:S3_REGION,credentials:{accessKeyId:access,secretAccessKey:secret}}):null;
 for(const [field,prefix] of uploads){
  const photo=f.get(field);
  if(!(photo instanceof File)||!photo.size)continue;
  if(!s3)return fail('Image storage is temporarily unavailable.',503);
  if(photo.size>5_000_000||!['image/jpeg','image/png','image/webp'].includes(photo.type))return fail('Upload a JPG, PNG or WebP under 5 MB.',413);
  const bytes=await sharp(Buffer.from(await photo.arrayBuffer()),{failOn:'error',limitInputPixels:16000000}).rotate().resize(900,900,{fit:'inside',withoutEnlargement:true}).png().toBuffer();
  const key='alumni-where-yat-now/pending/'+id+'/'+prefix+'/'+randomUUID()+'.png';
  await s3.send(new PutObjectCommand({Bucket:S3_BUCKET,Key:key,Body:bytes,ContentType:'image/png'}));
  const url=storyAssetUrl(key);
  const check=await moderatePhoto({imageUrl:url,purpose:'other_photo'});
  if(check?.decision!=='approve')return fail('The uploaded image could not pass automatic safety screening. Your saved card was not changed.',422);
  output[field]={url,key};
 }
 const publicOpt=f.get('businessPublic')==='yes';
 const updated=await query(`UPDATE public.alumni_where_yat_now SET
  location_city=$2,location_state=$3,occupation=$4,company_name=$5,business_website=$6,
  linkedin_url=$7,facebook_url=$8,instagram_url=$9,x_url=$10,business_contact_email=$11,
  business_contact_phone=$12,business_public_opt_in=$13,featured_memory_key=$14,
  company_logo_url=coalesce($15,company_logo_url),company_logo_key=coalesce($16,company_logo_key),
  business_headshot_url=coalesce($17,business_headshot_url),business_headshot_key=coalesce($18,business_headshot_key)
  WHERE id=$1 AND contributor_uid=$19 AND status IN ('pending','approved') RETURNING id,status,company_logo_url,business_headshot_url`,
  [id,txt('city',120),txt('state',80),txt('occupation',160),txt('company',160),website.url,
   social.linkedin,social.facebook,social.instagram,social.x,mail,phone,publicOpt,featured,
   output.companyLogo?.url||null,output.companyLogo?.key||null,output.businessHeadshot?.url||null,output.businessHeadshot?.key||null,who.uid]);
 if(!updated.rows[0])return fail('Your profile changed while editing. Refresh.',409);
 return NextResponse.json({ok:true,card:updated.rows[0]},{headers:{'Cache-Control':'no-store'}});
}
