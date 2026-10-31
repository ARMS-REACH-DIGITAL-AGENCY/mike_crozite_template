import { query } from '@/lib/db';
import WhereYatClaimForm from './WhereYatClaimForm';
import WhereYatReactions from './WhereYatReactions';

type AlumniUpdate = {
  id:number;
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
      `SELECT id, display_name, location_city, location_state, occupation, company_name, business_website,
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
    <div className="where-yat-profile" style={{ maxWidth: 850, margin: 'auto', padding: 16, fontFamily: 'Archivo,Arial,sans-serif', color: '#eee', backgroundColor:'#111', colorScheme:'dark' }}>
      <h2 style={{ fontFamily:'Oswald,Arial Narrow,sans-serif', fontSize: 25, fontWeight: 800, marginBottom: 12 }}>WHERE YAT NOW?</h2>
      {entry ? <div style={{maxWidth:800,display:'grid',gap:18}}>
        {([['favoriteHs','MOST MEMORABLE HIGH SCHOOL BASEBALL MOMENT',entry.favorite_hs_memory],['favoriteAfter','MOST MEMORABLE MOMENT AFTER GRADUATION',entry.favorite_post_hs_memory],['family','LIFE AND FAMILY',entry.family_life],['story','WHAT LIFE LOOKS LIKE NOW',entry.story],['business','BUSINESS SPOTLIGHT',entry.business_public_opt_in?entry.business_message:null]] as const).map(([key,label,value],index)=>value&&<article id={'where-yat-'+key} key={key} style={{border:'1px solid #444',borderRadius:8,overflow:'hidden',background:'#191919'}}>
          <header style={{padding:'12px 16px',borderBottom:'1px solid #444',fontFamily:'Oswald,sans-serif',fontSize:18,fontWeight:700}}>{entry.display_name||name} — {label}</header>
          {entry.life_photos_json?.[index]?.web||((index===0||index===3)&&entry.photo_url)?<img src={entry.life_photos_json?.[index]?.web||entry.photo_url||''} alt={label} style={{width:'100%',maxHeight:430,objectFit:'contain',background:'#101010'}}/>:null}
          <div style={{padding:'14px 16px'}}><p style={{whiteSpace:'pre-wrap',lineHeight:1.65,margin:0}}>{value}</p></div>
          <div style={{padding:'0 16px 12px'}}><WhereYatReactions id={entry.id} storyKey={key}/></div>
        </article>)}
        {entry.life_photos_json?.length>0&&<details style={{padding:16,border:'1px solid #444'}}><summary>AFTER BASEBALL — PHOTO ALBUM</summary><div style={{display:'flex',flexWrap:'wrap',gap:12,paddingTop:12}}>{entry.life_photos_json.map((photo,i)=><a key={i} href={photo.full} target="_blank" rel="noopener noreferrer"><img alt={'Life after baseball '+(i+1)} src={photo.web} style={{height:140,maxWidth:'100%',objectFit:'contain'}}/></a>)}</div></details>}
      </div> : <WhereYatClaimForm playerId={playerId} hsid={hsid} name={name} school={schoolName} />}
      <style>{`\n        .where-yat-profile { background:#111 !important; color:#f5f5f5 !important; }\n        .where-yat-profile article, .where-yat-profile section { background:#191919 !important; color:#f5f5f5 !important; }\n        .where-yat-profile h2, .where-yat-profile h3, .where-yat-profile p, .where-yat-profile strong { color:#f5f5f5 !important; opacity:1 !important; }\n        .where-yat-profile a { color:#e9bf56; }\n        .where-yat-profile .wyn-embedded, .where-yat-profile .wyn-body { background:#c2b9ae !important; color:#1e160e !important; }\n        .where-yat-profile .wyn-embedded p { color:#1e160e !important; }\n      `}</style>\n      <p style={{ marginTop: 18, fontSize: 13 }}>Interested in community partnerships? <a href="https://yatstats.com/partners/" target="_blank" rel="noopener noreferrer" style={{ color: '#e9bf56' }}>Explore optional YAT?STATS partnership opportunities</a></p>
    </div>
  );
}
