import { query } from '@/lib/db';
import { storyAssetUrl } from '@/lib/storyAssets';
import WhereYatProofCard from './WhereYatProofCard';
import WhereYatClaimForm from './WhereYatClaimForm';

type AlumniUpdate = {
  display_name: string;
  location_city: string | null;
  location_state: string | null;
  occupation: string | null;
  company_name: string | null;
  business_website: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  x_url: string | null;
  story: string | null;
  photo_key: string | null;
  photo_url: string | null;
  company_logo_url: string | null;
  retirement_year: number | null;favorite_hs_memory:string|null;favorite_post_hs_memory:string|null;family_life:string|null;business_message:string|null;business_offer:string|null;business_contact_email:string|null;business_contact_phone:string|null;business_public_opt_in:boolean;life_photos_json:Array<{web:string;full:string;thumb:string}>;
};

export default async function WhereYatProfilePanel({ playerId, hsid, name }: { playerId: string; hsid: string; name: string }) {
  let entry: AlumniUpdate | null = null;
  let schoolName='your high school';
  try {
    const { rows } = await query<AlumniUpdate>(
      `SELECT display_name, location_city, location_state, occupation, company_name, business_website,
        linkedin_url, instagram_url, facebook_url, x_url, story, photo_key, photo_url, company_logo_url, retirement_year, favorite_hs_memory, favorite_post_hs_memory, family_life, business_message,business_offer,business_contact_email,business_contact_phone,business_public_opt_in,life_photos_json
       FROM public.alumni_where_yat_now WHERE playerid=$1 AND hsid=$2 AND status='approved'
       ORDER BY reviewed_at DESC NULLS LAST, created_at DESC LIMIT 1`, [playerId, hsid]);
    entry = rows[0] || null;
    const school=await query<{hsname:string}>('SELECT hsname FROM public.school_success WHERE hsid::text=$1 LIMIT 1',[hsid]);
    schoolName=school.rows[0]?.hsname||schoolName;
  } catch (error) {
    console.error('[where-yat-profile] Could not fetch reviewed update', error);
  }
  return (
    <div style={{ maxWidth: 850, margin: 'auto', padding: 16, fontFamily: 'Archivo,Arial,sans-serif', color: '#eee' }}>
      <h2 style={{ fontFamily:'Oswald,Arial Narrow,sans-serif', fontSize: 25, fontWeight: 800, marginBottom: 12 }}>WHERE YAT NOW?</h2>
      {entry ? <article style={{maxWidth:800}}>
        <div style={{background:'#c2b9ae',color:'#1e160e',padding:18}}>
          <WhereYatProofCard variant="content" showName={false} proof={{
            playerId,hsid,displayName:entry.display_name||name,city:entry.location_city||'',state:entry.location_state||'',
            occupation:entry.occupation||'',company:entry.business_public_opt_in?entry.company_name||'':'',
            website:entry.business_public_opt_in?entry.business_website||'':'',
            linkedin:entry.linkedin_url||'',instagram:entry.instagram_url||'',facebook:entry.facebook_url||'',x:entry.x_url||'',
            story:entry.story||entry.favorite_post_hs_memory||'',photoUrl:entry.photo_url||storyAssetUrl(entry.photo_key),
            logoUrl:entry.business_public_opt_in?entry.company_logo_url:null,
          }}/>
        </div>
        <div style={{display:'grid',gap:18,marginTop:20}}>
          {([['MOST MEMORABLE HIGH SCHOOL BASEBALL MOMENT',entry.favorite_hs_memory],['MOST MEMORABLE MOMENT AFTER GRADUATION',entry.favorite_post_hs_memory],['LIFE AND FAMILY',entry.family_life],['WHAT LIFE LOOKS LIKE NOW',entry.story]] as const).map(([label,value])=>value&&<section key={label} style={{padding:18,border:'1px solid #555'}}><h3 style={{fontFamily:'Oswald,sans-serif',fontSize:19}}>{label}</h3><p style={{whiteSpace:'pre-wrap',lineHeight:1.65}}>{value}</p></section>)}
          {entry.retirement_year&&<p>RETIRED FROM BASEBALL: {entry.retirement_year}</p>}
          {entry.life_photos_json?.length>0&&<section><h3>AFTER BASEBALL — PHOTO ALBUM</h3><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10}}>{entry.life_photos_json.map((photo,i)=><a key={i} href={photo.full} target="_blank" rel="noopener noreferrer"><img alt={'Alumni life after baseball photo '+(i+1)} src={photo.web} style={{width:'100%',height:175,objectFit:'contain'}}/></a>)}</div></section>}
          {entry.business_public_opt_in&&(entry.business_message||entry.business_offer||entry.business_contact_email||entry.business_contact_phone)&&<section style={{padding:18,border:'1px solid #777'}}><h3>BUSINESS SPOTLIGHT</h3>{entry.business_message&&<p>{entry.business_message}</p>}{entry.business_offer&&<p><strong>SPECIAL OFFER:</strong> {entry.business_offer}</p>}{entry.business_contact_email&&<p><a href={'mailto:'+entry.business_contact_email}>{entry.business_contact_email}</a></p>}{entry.business_contact_phone&&<p>{entry.business_contact_phone}</p>}</section>}
        </div>
      </article> : <WhereYatClaimForm playerId={playerId} hsid={hsid} name={name} school={schoolName} />}
      <p style={{ marginTop: 18, fontSize: 13 }}>Interested in community partnerships? <a href="https://yatstats.com/partners/" target="_blank" rel="noopener noreferrer" style={{ color: '#e9bf56' }}>Explore optional YAT?STATS partnership opportunities</a></p>
    </div>
  );
}
