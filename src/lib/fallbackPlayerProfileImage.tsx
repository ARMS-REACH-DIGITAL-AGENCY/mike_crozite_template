// Player-profile share card: a static preview composed from the exact two
// optimized career-timeline cutouts displayed on the profile page.
// Messenger/link-preview crawlers cannot screenshot the interactive slider.
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { getPlayerById, getSchoolByHsid } from '@/lib/db';

export const runtime = 'nodejs';
const S3 = 'https://yatstats-assets.s3.us-west-2.amazonaws.com/players';
const imageSize = { width: 1200, height: 630 };
const VALID_PLAYER_ID = /^[A-Za-z0-9_-]{1,40}$/;

async function imageForTimeline(kind: 'then' | 'back', playerId: string): Promise<string | null> {
  const id = encodeURIComponent(playerId);
  // Prefer the same transparent hero used by ZoomableCareerTimeline. If the
  // cutout job has not reached a player, use only that player's real photo.
  const candidates = [
    S3 + '/' + kind + '-web/' + id + '.webp',
    S3 + '/' + kind + '-card/' + id + '.webp',
    S3 + '/' + kind + '/' + id + '.jpg',
  ];
  for (const src of candidates) {
    try {
      const response = await fetch(src, { signal: AbortSignal.timeout(3500), next: { revalidate: 3600 } });
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 6_000_000) continue;
      const png = await sharp(bytes)
        .resize({ width: 680, height: 550, fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 7 })
        .toBuffer();
      return 'data:image/png;base64,' + png.toString('base64');
    } catch {
      // A missing or unavailable photo must not break every share preview.
    }
  }
  return null;
}

export async function fallbackPlayerProfileImage(hsid: string, playerId: string, suppliedPlayer?: any): Promise<Buffer> {
  if (!VALID_PLAYER_ID.test(playerId)) throw new Error('Invalid player ID');

  const [player, school, thenImage, backImage] = await Promise.all([
    suppliedPlayer ? Promise.resolve(suppliedPlayer) : getPlayerById(playerId).catch(() => null),
    /^[0-9]{1,20}$/.test(hsid) ? getSchoolByHsid(hsid).catch(() => null) : Promise.resolve(null),
    imageForTimeline('then', playerId),
    imageForTimeline('back', playerId),
  ]);
  if (!player) throw new Error('Player not found');

  const firstName = String(player.firstname || player.first_name || '').trim().toUpperCase();
  const lastName = String(player.lastname || player.last_name || '').trim().toUpperCase();
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || 'PLAYER PROFILE';
  const schoolName = String(school?.hsname || player.high_school || 'HIGH SCHOOL ALUMNI').trim().toUpperCase();
  const teamName = String(player.current_team_name || '').trim().toUpperCase();
  const schoolLine = schoolName.length > 38 ? schoolName.slice(0, 36) + '…' : schoolName;

  const result = new ImageResponse(
    <div style={{
      display: 'flex', position: 'relative', width: 1200, height: 630,
      background: 'linear-gradient(120deg, #151515 0%, #111111 52%, #252525 100%)',
      color: '#ffffff', fontFamily: 'sans-serif', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 73% 50%, rgba(121,121,121,0.23), transparent 64%)',
      }} />
      <div style={{
        display: 'flex', position: 'absolute', left: 0, top: 0, width: 12, height: 630,
        background: '#c38c2d',
      }} />
      <div style={{
        display: 'flex', position: 'absolute', top: 38, left: 60, right: 50,
        justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontWeight: 800, fontSize: 25, letterSpacing: 1.3 }}>{schoolLine}</div>
          <div style={{ display: 'flex', marginTop: 5, fontSize: 18, letterSpacing: 2, color: '#c5c5c5' }}>ALUMNI PROFILE PAGE</div>
        </div>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 900, letterSpacing: -1 }}>YAT?STATS</div>
      </div>
      <div style={{
        display: 'flex', position: 'absolute', left: 62, top: 192, width: 520,
        flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', color: '#d3a04d', letterSpacing: 2.5, fontWeight: 800, fontSize: 20 }}>CAREER PATH TIMELINE</div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 16, fontWeight: 900, lineHeight: 0.96, fontSize: lastName.length > 13 ? 66 : 84 }}>
          {firstName ? <span style={{ display: 'flex' }}>{firstName}</span> : null}
          {lastName ? <span style={{ display: 'flex' }}>{lastName}</span> : null}
          {!firstName && !lastName ? <span style={{ display: 'flex' }}>{displayName}</span> : null}
        </div>
        {teamName ? <div style={{ display: 'flex', marginTop: 20, fontSize: 24, fontWeight: 700, color: '#dfdfdf' }}>{teamName}</div> : null}
      </div>
      {/* Separate photo layers make the same HS / current-era pairing visible
          in a chat thumbnail, without ever depending on browser scripting. */}
      {thenImage ? (
        <img src={thenImage} alt="" width={440} height={490}
          style={{ position: 'absolute', top: 124, left: 475, width: 440, height: 490, objectFit: 'contain', objectPosition: 'center bottom' }} />
      ) : null}
      {backImage ? (
        <img src={backImage} alt="" width={420} height={410}
          style={{ position: 'absolute', top: 202, left: 742, width: 420, height: 410, objectFit: 'contain', objectPosition: 'center bottom' }} />
      ) : null}
      <div style={{
        display: 'flex', position: 'absolute', left: 61, right: 61, bottom: 37,
        height: 5, borderRadius: 3, background: 'linear-gradient(90deg, #ad802e 0%, #d9ae56 70%, #ad802e 100%)',
      }} />
      <div style={{
        display: 'flex', position: 'absolute', right: 62, bottom: 51,
        color: '#dedede', fontSize: 18, fontWeight: 700, letterSpacing: 1.5,
      }}>PHOTOS · STATS · STORIES</div>
    </div>,
    {
      ...imageSize,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400' },
    },
  );
  return Buffer.from(await result.arrayBuffer());
}
