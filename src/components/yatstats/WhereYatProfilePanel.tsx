import { query } from '@/lib/db';
import { storyAssetUrl } from '@/lib/storyAssets';

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
};
const link = (url: string | null) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch { return null; }
};
export default async function WhereYatProfilePanel({ playerId, hsid, name }: { playerId: string; hsid: string; name: string }) {
  let entry: AlumniUpdate | null = null;
  try {
    const { rows } = await query<AlumniUpdate>(
      `SELECT display_name, location_city, location_state, occupation, company_name, business_website,
        linkedin_url, instagram_url, facebook_url, x_url, story, photo_key
       FROM public.alumni_where_yat_now WHERE playerid=$1 AND status='approved'
       ORDER BY reviewed_at DESC NULLS LAST, created_at DESC LIMIT 1`, [playerId]);
    entry = rows[0] || null;
  } catch (error) {
    // Safe during the deployment preceding the additive database migration.
    console.error('[where-yat-profile] Could not fetch reviewed update', error);
  }
  const socials = entry ? [
    ['Website', entry.business_website], ['LinkedIn', entry.linkedin_url],
    ['Instagram', entry.instagram_url], ['Facebook', entry.facebook_url], ['X', entry.x_url],
  ] as const : [];
  return (
    <div style={{ maxWidth: 850, margin: 'auto', padding: '16px', fontFamily: 'Archivo,Arial,sans-serif', color: '#eee' }}>
      <h2 style={{ fontSize: 25, fontWeight: 800, marginBottom: 12 }}>WHERE YAT NOW THESE DAYS?</h2>
      {entry ? (
        <article style={{ background: '#181818', border: '1px solid #777', padding: 16, borderRadius: 6 }}>
          {entry.photo_key && <img src={storyAssetUrl(entry.photo_key) || ''} alt={name + ' recent alumni photo'} style={{ float: 'right', width: 'min(33%,185px)', margin: '0 0 12px 14px', borderRadius: 4 }} />}
          <h3 style={{ fontSize: 22, fontWeight: 800 }}>{entry.display_name || name}</h3>
          {[entry.location_city, entry.location_state].filter(Boolean).length > 0 &&
            <p>{[entry.location_city, entry.location_state].filter(Boolean).join(', ')}</p>}
          {entry.occupation && <p><strong>Now:</strong> {entry.occupation}</p>}
          {entry.company_name && <p><strong>Business:</strong> {entry.company_name}</p>}
          {entry.story && <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{entry.story}</p>}
          <div style={{ clear: 'both', display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
            {socials.map(([label, url]) => link(url) &&
              <a key={label} href={link(url)!} target="_blank" rel="noopener noreferrer" style={{ color: '#e9bf56', textDecoration: 'underline' }}>{label} ↗</a>)}
          </div>
        </article>
      ) : <p>Know what {name} has been doing since baseball? Help us reconnect the alumni community with an updated photo, business and social links.</p>}
      <button type="button" data-where-yat-profile-player={playerId} data-where-yat-profile-school={hsid} data-where-yat-profile-name={name}
        style={{ marginTop: 16, padding: '12px 18px', background: '#145a3c', border: 0, color: 'white', fontWeight: 800, cursor: 'pointer' }}>
        {entry ? 'SUBMIT AN UPDATED STORY →' : 'SHARE A FREE ALUMNI UPDATE →'}
      </button>
      <p style={{ marginTop: 18, fontSize: 13 }}>Have a business to promote? <a href={`/${hsid}#sec-partner`} style={{ color: '#e9bf56' }}>Explore optional YAT?STATS Partnership opportunities →</a></p>
    </div>
  );
}
