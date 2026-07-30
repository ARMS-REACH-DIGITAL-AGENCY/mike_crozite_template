import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const sourcePath = 'design/sponsor-ads/tpc-golfers-source.webp';

const desktopOverlay = Buffer.from(`
  <svg width="1800" height="140" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" x2="1">
        <stop offset="0" stop-color="#020b15" stop-opacity=".05"/>
        <stop offset=".34" stop-color="#020b15" stop-opacity=".35"/>
        <stop offset=".48" stop-color="#020b15" stop-opacity=".96"/>
        <stop offset="1" stop-color="#020b15"/>
      </linearGradient>
      <linearGradient id="cta" x1="0" x2="1">
        <stop offset="0" stop-color="#087b45"/>
        <stop offset="1" stop-color="#10a65c"/>
      </linearGradient>
    </defs>
    <rect width="1800" height="140" fill="url(#fade)"/>
    <rect x="500" y="11" width="196" height="29" rx="14.5" fill="#f5c451"/>
    <path d="M526 38l-20 17 42-15z" fill="#f5c451"/>
    <text x="598" y="32" text-anchor="middle" fill="#061522" font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="700">WHO'S THEY?</text>
    <text x="730" y="38" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="27" font-weight="700">THEY'RE GIVING AWAY</text>
    <text x="726" y="112" fill="#f5c451" font-family="Arial,Helvetica,sans-serif" font-size="78" font-weight="700">$75</text>
    <text x="884" y="84" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="37" font-weight="700">SHIPSTICKS</text>
    <text x="884" y="116" fill="#d9e7e2" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="700" letter-spacing="1.3">TRAVEL CREDIT</text>
    <rect x="1320" y="17" width="445" height="82" rx="11" fill="url(#cta)" stroke="#fff" stroke-width="3"/>
    <text x="1542.5" y="69" text-anchor="middle" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="38" font-weight="700">CLAIM YOURS TODAY!</text>
    <text x="1542.5" y="124" text-anchor="middle" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="700" letter-spacing="1.3">THE TRAVEL PROTECTION CLUB</text>
  </svg>
`);

const mobileOverlay = Buffer.from(`
  <svg width="750" height="140" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" x2="1">
        <stop offset="0" stop-color="#020b15" stop-opacity=".08"/>
        <stop offset=".24" stop-color="#020b15" stop-opacity=".38"/>
        <stop offset=".42" stop-color="#020b15" stop-opacity=".96"/>
        <stop offset="1" stop-color="#020b15"/>
      </linearGradient>
      <linearGradient id="cta" x1="0" x2="1">
        <stop offset="0" stop-color="#087b45"/>
        <stop offset="1" stop-color="#10a65c"/>
      </linearGradient>
    </defs>
    <rect width="750" height="140" fill="url(#fade)"/>
    <rect x="150" y="7" width="139" height="24" rx="12" fill="#f5c451"/>
    <path d="M172 29l-16 14 34-12z" fill="#f5c451"/>
    <text x="219.5" y="25" text-anchor="middle" fill="#061522" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="700">WHO'S THEY?</text>
    <text x="214" y="56" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="700">THEY'RE GIVING AWAY</text>
    <text x="211" y="111" fill="#f5c451" font-family="Arial,Helvetica,sans-serif" font-size="57" font-weight="700">$75</text>
    <text x="320" y="86" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="700">SHIPSTICKS</text>
    <text x="320" y="113" fill="#d9e7e2" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="700">TRAVEL CREDIT</text>
    <rect x="535" y="19" width="200" height="77" rx="10" fill="url(#cta)" stroke="#fff" stroke-width="3"/>
    <text x="635" y="53" text-anchor="middle" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="700">CLAIM YOURS</text>
    <text x="635" y="80" text-anchor="middle" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="700">TODAY!</text>
    <text x="635" y="121" text-anchor="middle" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="9.5" font-weight="700" letter-spacing=".55">TRAVEL PROTECTION CLUB</text>
  </svg>
`);

async function renderDesktop() {
  const golfers = await sharp(sourcePath)
    .resize({ height: 280 })
    .extract({ left: 0, top: 42, width: 700, height: 140 })
    .toBuffer();

  const banner = await sharp({
    create: { width: 1800, height: 140, channels: 3, background: '#020b15' },
  })
    .composite([
      { input: golfers, left: 0, top: 0 },
      { input: desktopOverlay, left: 0, top: 0 },
    ])
    .webp({ quality: 88 })
    .toBuffer();

  await sharp(banner)
    .resize({ width: 1800, height: 132, fit: 'fill' })
    .webp({ quality: 88 })
    .toFile('public/ads/tpc-shipsticks-desktop.webp');
}

async function renderMobile() {
  const golfers = await sharp(sourcePath)
    .resize({ height: 235 })
    .extract({ left: 0, top: 33, width: 588, height: 140 })
    .toBuffer();

  const banner = await sharp({
    create: { width: 750, height: 140, channels: 3, background: '#020b15' },
  })
    .composite([
      { input: golfers, left: -115, top: 0 },
      { input: mobileOverlay, left: 0, top: 0 },
    ])
    .webp({ quality: 88 })
    .toBuffer();

  await sharp(banner)
    .resize({ width: 750, height: 132, fit: 'fill' })
    .webp({ quality: 88 })
    .toFile('public/ads/tpc-shipsticks-mobile.webp');
}

await Promise.all([renderDesktop(), renderMobile()]);
