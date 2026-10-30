import { query } from '@/lib/db';
import { storyAssetUrl } from '@/lib/storyAssets';
import WhereYatProofCard from './WhereYatProofCard';

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
};

export default async function WhereYatProfilePanel({ playerId, hsid, name }: { playerId: string; hsid: string; name: string }) {
  let entry: AlumniUpdate | null = null;
  try {
    const { rows } = await query<AlumniUpdate>(
      `SELECT display_name, location_city, location_state, occupation, company_name, business_website,
        linkedin_url, instagram_url, facebook_url, x_url, story, photo_key, photo_url, company_logo_url
       FROM public.alumni_where_yat_now WHERE playerid=$1 AND hsid=$2 AND status='approved'
       ORDER BY reviewed_at DESC NULLS LAST, created_at DESC LIMIT 1`, [playerId, hsid]);
    entry = rows[0] || null;
  } catch (error) {
    console.error('[where-yat-profile] Could not fetch reviewed update', error);
  }
  return (
    <div style={{ maxWidth: 850, margin: 'auto', padding: 16, fontFamily: 'Archivo,Arial,sans-serif', color: '#eee' }}>
      <h2 style={{ fontFamily:'Oswald,Arial Narrow,sans-serif', fontSize: 25, fontWeight: 800, marginBottom: 12 }}>WHERE YAT NOW?</h2>
      {entry ? (
        <article style={{backgroundColor:'#c2b9ae',color:'#1e160e',border:'2px solid rgba(30,22,14,0.65)',padding:16,maxWidth:650,
          backgroundImage:'repeating-linear-gradient(168deg,transparent 0,transparent 3px,rgba(255,255,255,.05) 3px,rgba(255,255,255,.05) 4px)'}}>
          <WhereYatProofCard variant="content" showName={false} proof={{
            playerId, hsid, displayName:entry.display_name||name,
            city:entry.location_city||'',state:entry.location_state||'',
            occupation:entry.occupation||'',company:entry.company_name||'',
            website:entry.business_website||'',linkedin:entry.linkedin_url||'',
            instagram:entry.instagram_url||'',facebook:entry.facebook_url||'',
            x:entry.x_url||'',story:entry.story||'',
            photoUrl:entry.photo_url||storyAssetUrl(entry.photo_key),
            logoUrl:entry.company_logo_url,
          }}/>
        </article>
      ) : <p>Know what {name} has been doing since baseball? Help us reconnect the alumni community with an updated photo, company logo and social links.</p>}
      <button type="button" data-where-yat-profile-player={playerId} data-where-yat-profile-school={hsid} data-where-yat-profile-name={name}
        style={{ marginTop: 16, padding: '12px 18px', background: '#e9bf56', border: 0, color: '#151515', fontFamily: 'Oswald,Barlow Condensed,sans-serif', fontWeight: 800, letterSpacing: '.04em', cursor: 'pointer' }}>
        {entry ? 'SUBMIT AN UPDATED STORY' : 'SHARE A FREE ALUMNI UPDATE'}
      </button>
      <p style={{ marginTop: 18, fontSize: 13 }}>Have a business to promote? <a href="https://yatstats.com/partners/" target="_blank" rel="noopener noreferrer" style={{ color: '#e9bf56' }}>Explore optional YAT?STATS partnership opportunities</a></p>
    </div>
  );
}
