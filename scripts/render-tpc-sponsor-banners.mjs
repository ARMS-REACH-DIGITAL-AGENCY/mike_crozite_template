import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const golferSourcePath = 'design/sponsor-ads/tpc-golfers-source.webp';
const whosTheyLogoPath = 'design/sponsor-ads/whos-they-logo-source.webp';

const desktopOverlay = Buffer.from(`
  <svg width="1800" height="132" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="leftFade">
        <stop offset="0" stop-color="#020b15"/>
        <stop offset="1" stop-color="#020b15" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="rightFade">
        <stop offset="0" stop-color="#020b15" stop-opacity="0"/>
        <stop offset="1" stop-color="#020b15"/>
      </linearGradient>
      <linearGradient id="cta" x1="0" x2="1">
        <stop offset="0" stop-color="#087b45"/>
        <stop offset="1" stop-color="#10a65c"/>
      </linearGradient>
    </defs>

    <rect x="545" y="0" width="170" height="132" fill="url(#leftFade)"/>
    <rect x="1110" y="0" width="170" height="132" fill="url(#rightFade)"/>

    <text x="34" y="32" fill="#f5c451" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="800">HEY,</text>
    <text x="99" y="32" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="800">THEY'RE GIVING AWAY</text>
    <text x="31" y="107" fill="#f5c451" font-family="Arial,Helvetica,sans-serif" font-size="74" font-weight="800">$75</text>
    <text x="188" y="80" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="800">SHIPSTICKS</text>
    <text x="190" y="111" fill="#d9e7e2" font-family="Arial,Helvetica,sans-serif" font-size="23" font-weight="800" letter-spacing="1.2">TRAVEL CREDIT</text>

    <path d="M507 34h92l25 18-7-18h24" fill="none" stroke="#f5c451" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>

    <rect x="1545" y="105" width="220" height="22" rx="11" fill="url(#cta)" stroke="#fff" stroke-width="1.5"/>
    <text x="1655" y="121" text-anchor="middle" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="800" letter-spacing=".7">CLAIM YOURS TODAY</text>
  </svg>
`);

const mobileOverlay = Buffer.from(`
  <svg width="750" height="132" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="leftFade">
        <stop offset="0" stop-color="#020b15"/>
        <stop offset="1" stop-color="#020b15" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="rightFade">
        <stop offset="0" stop-color="#020b15" stop-opacity="0"/>
        <stop offset="1" stop-color="#020b15"/>
      </linearGradient>
    </defs>

    <rect x="62" y="0" width="205" height="132" fill="url(#leftFade)"/>
    <rect x="470" y="0" width="90" height="132" fill="url(#rightFade)"/>

    <text x="11" y="22" fill="#f5c451" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="800">HEY,</text>
    <text x="52" y="22" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="800">THEY'RE</text>
    <text x="11" y="42" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="800">GIVING AWAY</text>
    <text x="9" y="105" fill="#f5c451" font-family="Arial,Helvetica,sans-serif" font-size="58" font-weight="800">$75</text>
    <text x="113" y="79" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="800">SHIPSTICKS</text>
    <text x="114" y="103" fill="#d9e7e2" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="800">TRAVEL CREDIT</text>

    <path d="M186 35h36l22 14-7-14h19" fill="none" stroke="#f5c451" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`);

async function renderDesktop() {
  const golfers = await sharp(golferSourcePath)
    .resize({ height: 260 })
    .extract({ left: 0, top: 35, width: 650, height: 132 })
    .toBuffer();
  const logo = await sharp(whosTheyLogoPath)
    .resize({ width: 190 })
    .toBuffer();

  await sharp({
    create: { width: 1800, height: 132, channels: 3, background: '#020b15' },
  })
    .composite([
      { input: golfers, left: 575, top: 0 },
      { input: logo, left: 1560, top: 0 },
      { input: desktopOverlay, left: 0, top: 0 },
    ])
    .webp({ quality: 90 })
    .toFile('public/ads/tpc-shipsticks-desktop.webp');
}

async function renderMobile() {
  const golfers = await sharp(golferSourcePath)
    .resize({ height: 240 })
    .extract({ left: 0, top: 30, width: 600, height: 132 })
    .toBuffer();
  const logo = await sharp(whosTheyLogoPath)
    .resize({ width: 178 })
    .toBuffer();

  await sharp({
    create: { width: 750, height: 132, channels: 3, background: '#020b15' },
  })
    .composite([
      { input: golfers, left: 75, top: 0 },
      { input: logo, left: 560, top: 8 },
      { input: mobileOverlay, left: 0, top: 0 },
    ])
    .webp({ quality: 90 })
    .toFile('public/ads/tpc-shipsticks-mobile.webp');
}

await Promise.all([renderDesktop(), renderMobile()]);
