import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const golferSourcePath = 'design/sponsor-ads/tpc-golfers-source.webp';
const whosTheyLogoPath = 'design/sponsor-ads/whos-they-logo-source.webp';
const approvedMobileSourcePath =
  'design/sponsor-ads/tpc-mobile-approved-source.jpg';

const desktopOverlay = Buffer.from(`
  <svg width="1800" height="132" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cta" x1="0" x2="1">
        <stop offset="0" stop-color="#07111d"/>
        <stop offset="1" stop-color="#101c2a"/>
      </linearGradient>
    </defs>

    <text x="24" y="78" fill="#fff" font-family="Nimbus Sans Narrow,Arial Narrow,Arial,sans-serif" font-size="27" font-weight="800" letter-spacing=".15">
      HEY, THEY'RE GIVING AWAY <tspan fill="#f5c451" font-size="39">$75</tspan><tspan dx="8" fill="#fff">IN SHIPSTICKS TRAVEL CREDIT</tspan>
    </text>
    <rect x="24" y="93" width="780" height="3" rx="1.5" fill="#d72838"/>

    <rect x="1512" y="101" width="260" height="25" rx="5" fill="url(#cta)" stroke="#334c68" stroke-width="2"/>
    <text x="1642" y="119" text-anchor="middle" fill="#fff" font-family="Nimbus Sans Narrow,Arial Narrow,Arial,sans-serif" font-size="16" font-weight="800" letter-spacing=".6">CLAIM YOURS TODAY.  ›</text>
  </svg>
`);

async function renderDesktop() {
  const golfers = await sharp(golferSourcePath)
    .resize({ height: 132 })
    .toBuffer();
  const logo = await sharp(whosTheyLogoPath)
    .resize({ width: 248, height: 98, fit: 'contain', background: '#020b15' })
    .toBuffer();

  await sharp({
    create: { width: 1800, height: 132, channels: 3, background: '#020b15' },
  })
    .composite([
      { input: golfers, left: 870, top: 0 },
      { input: logo, left: 1518, top: 1 },
      { input: desktopOverlay, left: 0, top: 0 },
    ])
    .webp({ quality: 90 })
    .toFile('public/ads/tpc-shipsticks-desktop.webp');
}

async function renderMobile() {
  await sharp(approvedMobileSourcePath)
    .resize({
      width: 750,
      height: 132,
      fit: 'cover',
      position: 'center',
    })
    .webp({ quality: 90 })
    .toFile('public/ads/tpc-shipsticks-mobile.webp');
}

await Promise.all([renderDesktop(), renderMobile()]);
