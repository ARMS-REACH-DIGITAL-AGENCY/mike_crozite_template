import { query } from '@/lib/db';
import WhereYatClaimForm from './WhereYatClaimForm';
import WhereYatReactions from './WhereYatReactions';
import { StoryStyles } from './StoryViewer';
import SponsorTower from './SponsorTower';
import WhereYatShareButton from './WhereYatShareButton';

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
      <StoryStyles />
      <div className={entry ? 'wyn-panel-heading wyn-panel-heading-approved' : 'wyn-panel-heading wyn-panel-heading-unclaimed'}>
        <h2 className="wyn-panel-title">{entry
          ? `#YATABOY ${(entry.display_name || name).trim().toUpperCase()}`
          : `WHERE YAT NOW, ${(name.trim().split(/\s+/)[0] || 'ALUMNUS').toUpperCase()}?`}</h2>
        {entry && <WhereYatShareButton playerName={entry.display_name || name} />}
      </div>
      {entry ? <div className="wyn-story-layout"><div className="wyn-story-feed">
        {([['favoriteHs','MOST MEMORABLE HIGH SCHOOL BASEBALL MOMENT',entry.favorite_hs_memory],['favoriteAfter','MOST MEMORABLE MOMENT AFTER GRADUATION',entry.favorite_post_hs_memory],['family','LIFE AND FAMILY',entry.family_life],['story','WHAT LIFE LOOKS LIKE NOW',entry.story],['business','BUSINESS SPOTLIGHT',entry.business_public_opt_in?entry.business_message:null]] as const).map(([key,label,value],index)=>value&&<article id={'where-yat-'+key} key={key} className="wyn-story-card ysf">
          <header className="wyn-story-header">{entry.display_name||name} — {label}</header>
          {(key==='family'&&entry.life_photos_json?.length>0)||((key==='story')&&entry.photo_url&&!entry.life_photos_json?.length)?<div className="wyn-story-photo-grid">{(key==='family'?entry.life_photos_json:[{web:entry.photo_url||'',full:entry.photo_url||'',thumb:''}]).filter(photo=>photo.web).map((photo,i)=><img key={i} src={photo.web} alt={`${label} photo ${i+1}`} className="wyn-story-image"/>)}</div>:null}
          <div className="wyn-story-body"><p style={{whiteSpace:'pre-wrap',lineHeight:1.65,margin:0}}>{value}</p></div>
          <div className="wyn-story-actions"><WhereYatReactions id={entry.id} storyKey={key}/></div>
        </article>)}
        <aside className="wyn-story-inline-ad" aria-label="Player Profile Partner in-feed sponsor">
          <span>PLAYER PROFILE PARTNER</span><strong>ADVERTISER PLACEMENT</strong><small>IN-FEED SPONSOR CARD</small>
        </aside>
        {entry.life_photos_json?.length>0&&<details style={{padding:16,border:'1px solid #444'}}><summary>AFTER BASEBALL — PHOTO ALBUM</summary><div style={{display:'flex',flexWrap:'wrap',gap:12,paddingTop:12}}>{entry.life_photos_json.map((photo,i)=><a key={i} href={photo.full} target="_blank" rel="noopener noreferrer"><img alt={'Life after baseball '+(i+1)} src={photo.web} style={{height:140,maxWidth:'100%',objectFit:'contain'}}/></a>)}</div></details>}
      </div><aside className="wyn-story-sponsor"><SponsorTower placement="player-stories" /></aside></div> : <WhereYatClaimForm playerId={playerId} hsid={hsid} name={name} school={schoolName} />}
      <style>{`
        .where-yat-profile { padding: 12px; width:100%; box-sizing:border-box; color:var(--yat-text,#f5f5f5); background:transparent; font-family:var(--yat-font-ui,Archivo,Arial,sans-serif); }
        /* Keep the current sticky heading in the same place, switching only
           alignment and copy after an approved questionnaire. */
        .where-yat-profile .wyn-panel-heading {position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:8px;min-width:0;background:var(--psi-page-bg,var(--bg,#070707));color:var(--wyn-card-text);margin:0 0 10px;padding:8px 4px;border-bottom:1px solid var(--wyn-border);}
        .where-yat-profile .wyn-panel-title {min-width:0;max-width:100%;font:700 22px/1.2 var(--yat-font-condensed,Oswald,Arial Narrow,sans-serif);text-transform:uppercase;margin:0;overflow-wrap:break-word;}
        .where-yat-profile .wyn-panel-heading-unclaimed {justify-content:flex-start;text-align:left;}
        .where-yat-profile .wyn-panel-heading-approved {justify-content:flex-end;text-align:right;}
        .where-yat-profile .wyn-panel-heading-approved .wyn-panel-title {flex:0 1 auto;text-align:right;}
        .where-yat-profile .wyn-panel-share {display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex:none;}
        .where-yat-profile .wyn-panel-share-btn {display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:42px;min-height:36px;padding:5px 8px;background:transparent;color:inherit;border:1px solid var(--wyn-border);border-radius:5px;cursor:pointer;font:700 11px/1 var(--yat-font-ui,Archivo,Arial,sans-serif);}
        .where-yat-profile .wyn-panel-share-btn i {font-size:18px;line-height:1;}
        .where-yat-profile .wyn-panel-share-btn:hover,.where-yat-profile .wyn-panel-share-btn:focus-visible {background:var(--wyn-card-bg);outline-offset:2px;}
        .where-yat-profile .wyn-panel-share-feedback {font:600 10px/1.2 var(--yat-font-ui,Archivo,Arial,sans-serif);max-width:85px;}
        @media(max-width:410px){.where-yat-profile .wyn-panel-title{font-size:20px;}.where-yat-profile .wyn-panel-share-btn{min-height:34px;padding:4px 6px;}}
        .wyn-story-layout { display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:12px; align-items:start; }
        .wyn-story-feed { min-width:0; display:grid; gap:8px; }
        .wyn-story-inline-ad{display:none;box-sizing:border-box;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:160px;width:100%;padding:16px;border:1px dashed var(--wyn-border);border-radius:8px;text-align:center;color:var(--wyn-card-text);background:var(--wyn-card-bg);}
        .wyn-story-inline-ad strong{font:800 20px/1.1 var(--yat-font-compact,Oswald,sans-serif);}
        .wyn-story-inline-ad :is(span,small){font:600 11px/1.3 var(--yat-font-ui,Arial,sans-serif);}
        body.drawer-contribute-open .wyn-story-inline-ad{display:flex;}
        @media(max-width:899px){.wyn-story-inline-ad{display:flex;}}
        .wyn-story-sponsor { position:sticky; top:110px; min-width:0; }
        .wyn-story-card { border:1px solid var(--yat-border,rgba(128,128,128,.3)); border-radius:8px; overflow:hidden; background:var(--yat-card-bg,rgba(128,128,128,.08)); color:inherit; }
        .wyn-story-header { padding:10px 12px; border-bottom:1px solid var(--yat-border,rgba(128,128,128,.3)); font:700 12px/1.3 var(--yat-font-ui,Archivo,Arial,sans-serif); }
        .wyn-story-photo-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr)); gap:2px; background:#101010; }
        .wyn-story-image { display:block; width:100%; max-height:520px; object-fit:contain; background:#101010; }
        .wyn-story-body { padding:12px; font:400 13px/1.4 var(--yat-news-font,Georgia,serif); }
        .wyn-story-actions { padding:0; border-top:0; }
        .where-yat-profile .wyn-reactions {margin:0;padding:0;border:0;color:inherit;}
        .where-yat-profile .ysf-card-actions {border-top:1px solid var(--wyn-border);border-bottom:1px solid var(--wyn-border);}
        .where-yat-profile .ysf-card-actions button {color:var(--wyn-card-text);font:600 13px/1 var(--yat-font-ui,Arial,sans-serif);}
        .where-yat-profile .ysf-card-actions button i {font-size:15px;}
        .where-yat-profile .ysf-card-actions button.ysf-liked {color:var(--ysv-gold-text);}
        .where-yat-profile .ysv-comments {padding:12px;}
        .where-yat-profile .ysv-composer {padding:10px 12px 12px;}
        .where-yat-profile .ysv-note {margin:10px 12px;}
        body.light-theme .where-yat-profile .wyn-story-card {--ysv-input-bg:rgba(255,255,255,.8);--ysv-gold-text:#9a6f00;}
        @media(max-width:899px){.wyn-story-layout{display:block}.wyn-story-sponsor{display:none}.where-yat-profile{padding:10px}}
        /* StoriesFeed is the source of truth: theme lives on body.light-theme, not html. */
        .where-yat-profile { --wyn-card-bg:rgba(255,255,255,.055); --wyn-card-text:rgba(255,255,255,.88); --wyn-border:rgba(255,255,255,.14); color:var(--wyn-card-text); }
        body.light-theme .where-yat-profile { --wyn-card-bg:rgba(255,255,255,.52); --wyn-card-text:rgba(31,25,18,.86); --wyn-border:rgba(53,43,30,.18); }
        .where-yat-profile .wyn-story-card { background:var(--wyn-card-bg); color:var(--wyn-card-text); border-color:var(--wyn-border); --ysv-fg:var(--wyn-card-text); --ysv-text:var(--wyn-card-text); --ysv-line:var(--wyn-border); --ysv-bubble:rgba(128,128,128,.1); --ysv-input-bg:rgba(128,128,128,.08); --ysv-input-border:var(--wyn-border); --ysv-gold:#FFD700; --ysv-gold-text:#e1b833; --ysv-avatar-sm-bg:rgba(128,128,128,.12); }
        .where-yat-profile .wyn-story-header,.where-yat-profile .wyn-story-actions {border-color:var(--wyn-border);}
        .where-yat-profile .wyn-story-body {font:400 13px/1.4 var(--yat-news-font,Georgia,serif);}
        .where-yat-profile .wyn-story-header {font:700 12px/1.3 var(--yat-font-ui,Archivo,Arial,sans-serif);}
        @media(max-width:410px){.where-yat-profile .wyn-story-body{font-size:12px;}}

      `}</style>
      <p style={{ marginTop: 18, fontSize: 13 }}>Interested in community partnerships? <a href="https://yatstats.com/partners/" target="_blank" rel="noopener noreferrer" style={{ color: '#e9bf56' }}>Explore optional YAT?STATS partnership opportunities</a></p>
    </div>
  );
}
