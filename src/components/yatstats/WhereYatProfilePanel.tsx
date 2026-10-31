import { query } from '@/lib/db';
import WhereYatClaimForm from './WhereYatClaimForm';
import WhereYatReactions from './WhereYatReactions';
import SponsorTower from './SponsorTower';

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
    <div className="where-yat-profile">
      <h2 style={{ fontFamily:'Oswald,Arial Narrow,sans-serif', fontSize: 25, fontWeight: 800, marginBottom: 12 }}>WHERE YAT NOW?</h2>
      {entry ? <div className="wyn-story-layout"><div className="wyn-story-feed">
        {([['favoriteHs','MOST MEMORABLE HIGH SCHOOL BASEBALL MOMENT',entry.favorite_hs_memory],['favoriteAfter','MOST MEMORABLE MOMENT AFTER GRADUATION',entry.favorite_post_hs_memory],['family','LIFE AND FAMILY',entry.family_life],['story','WHAT LIFE LOOKS LIKE NOW',entry.story],['business','BUSINESS SPOTLIGHT',entry.business_public_opt_in?entry.business_message:null]] as const).map(([key,label,value],index)=>value&&<article id={'where-yat-'+key} key={key} className="wyn-story-card">
          <header className="wyn-story-header">{entry.display_name||name} — {label}</header>
          {entry.life_photos_json?.[index]?.web||((index===0||index===3)&&entry.photo_url)?<img src={entry.life_photos_json?.[index]?.web||entry.photo_url||''} alt={label} className="wyn-story-image"/>:null}
          <div className="wyn-story-body"><p style={{whiteSpace:'pre-wrap',lineHeight:1.65,margin:0}}>{value}</p></div>
          <div className="wyn-story-actions"><WhereYatReactions id={entry.id} storyKey={key}/></div>
        </article>)}
        {entry.life_photos_json?.length>0&&<details style={{padding:16,border:'1px solid #444'}}><summary>AFTER BASEBALL — PHOTO ALBUM</summary><div style={{display:'flex',flexWrap:'wrap',gap:12,paddingTop:12}}>{entry.life_photos_json.map((photo,i)=><a key={i} href={photo.full} target="_blank" rel="noopener noreferrer"><img alt={'Life after baseball '+(i+1)} src={photo.web} style={{height:140,maxWidth:'100%',objectFit:'contain'}}/></a>)}</div></details>}
      </div><aside className="wyn-story-sponsor"><SponsorTower placement="player-stories" /></aside></div> : <WhereYatClaimForm playerId={playerId} hsid={hsid} name={name} school={schoolName} />}
      <style>{`
        .where-yat-profile { padding: 12px; width:100%; box-sizing:border-box; color:var(--yat-text,#f5f5f5); background:transparent; font-family:var(--yat-font-ui,Archivo,Arial,sans-serif); }
        .where-yat-profile h2 { font:700 22px/1.2 var(--yat-font-condensed,Oswald,Arial Narrow,sans-serif); margin:4px 0 14px; }
        .wyn-story-layout { display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:12px; align-items:start; }
        .wyn-story-feed { min-width:0; display:grid; gap:8px; }
        .wyn-story-sponsor { position:sticky; top:110px; min-width:0; }
        .wyn-story-card { border:1px solid var(--yat-border,rgba(128,128,128,.3)); border-radius:8px; overflow:hidden; background:var(--yat-card-bg,rgba(128,128,128,.08)); color:inherit; }
        .wyn-story-header { padding:10px 12px; border-bottom:1px solid var(--yat-border,rgba(128,128,128,.3)); font:700 14px/1.3 var(--yat-font-ui,Archivo,Arial,sans-serif); }
        .wyn-story-image { display:block; width:100%; max-height:520px; object-fit:contain; background:#101010; }
        .wyn-story-body { padding:12px; font:400 14px/1.5 var(--yat-news-font,Georgia,serif); }
        .wyn-story-actions { padding:0 12px 12px; border-top:1px solid var(--yat-border,rgba(128,128,128,.3)); }
        @media(max-width:899px){.wyn-story-layout{display:block}.wyn-story-sponsor{display:none}.where-yat-profile{padding:10px}}
        @media(prefers-color-scheme:light){.where-yat-profile{color:#171717}.wyn-story-card{background:#fff;border-color:#d4d4d4}.wyn-story-header,.wyn-story-actions{border-color:#d4d4d4}}
        @media(prefers-color-scheme:dark){.where-yat-profile{color:#f4f4f4}.wyn-story-card{background:#191919;border-color:#444}.wyn-story-header,.wyn-story-actions{border-color:#444}}
      `}</style>
      <p style={{ marginTop: 18, fontSize: 13 }}>Interested in community partnerships? <a href="https://yatstats.com/partners/" target="_blank" rel="noopener noreferrer" style={{ color: '#e9bf56' }}>Explore optional YAT?STATS partnership opportunities</a></p>
    </div>
  );
}
