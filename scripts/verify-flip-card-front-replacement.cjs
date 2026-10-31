// Regression contract: one player, one live flip-card front, reversible versions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (path) => fs.readFileSync(path, 'utf8');

const publisher = read('src/lib/contributeServer.ts');
const images = read('src/lib/db.ts');
const intake = read('src/app/api/contribute/photo/route.ts');
const preview = read('src/app/api/contribute/card-preview/route.ts');
const form = read('src/components/yatstats/ContributePhotoFlow.tsx');
const card = read('src/components/yatstats/PlayerCardFront.tsx');
const front = read('src/components/yatstats/CardPhoto.tsx');
const page = read('src/app/[hsid]/page.tsx');
const layout = read('src/app/[hsid]/layout.tsx');
const embed = read('src/app/embed/player-card/[playerId]/page.tsx');
const og = read('src/app/api/og/player-card/route.tsx');

// Every approved front has its own immutable URL. The previous image must
// survive a replacement; updates must not corrupt the TBC/raw photo tables.
assert.match(publisher, /players\/front-archive\//, 'archive previous front');
assert.match(publisher, /players\/front-uploads\//, 'publish permanent front URL');
assert.match(publisher, /if \(purpose === 'flip_card'\)/);
assert.match(publisher, /replaceCutout\('then'/, 'refresh original timeline cutout');
assert.match(publisher, /players\/then-card\//, 'preserve legacy card path');

// A legacy approved upload like Mike Woods YAT000072 must get a versioned URL
// without re-uploading, and all shared card surfaces must use it.
assert.match(images, /purpose = 'flip_card'/, 'resolve approved front uploads');
assert.match(images, /status = 'approved'/, 'ignore unapproved photos');
assert.match(images, /getBatchDesignatedPlayerImages/, 'shared resolver');
assert.match(images, /\?v=\$\{encodeURIComponent\(row\.id\)\}/, 'bust cache for legacy approved cards');
assert.match(images, /permanentKey/, 'new uploads use immutable URLs');
assert.match(card, /frontImageUrl/, 'card renderer needs front photo override');
assert.match(page, /frontImageMap\.get\(playerId\)\?\.image_url/, 'gallery front override');
assert.match(layout, /getBatchDesignatedPlayerImages/, 'interaction strip front override');
assert.match(embed, /getBatchDesignatedPlayerImages/, 'embed front override');
assert.match(og, /getDesignatedPlayerImage\(playerId, "YATSTATS_FRONT"\)/, 'social preview front override');

// Contribute shows a real before/after and requires deliberate confirmation
// before a replacement, while preserving existing AI moderation.
assert.match(preview, /currentFrontImageUrl/, 'display currently approved photo');
assert.match(form, /CURRENT FRONT/, 'compare original photo');
assert.match(form, /NEW FRONT/, 'compare proposed photo');
assert.match(form, /frontReplacementConfirmed/, 'explicit user consent');
assert.match(form, /form\.set\('confirmReplaceFront', '1'\)/, 'submit consent to server');
assert.match(intake, /confirmReplaceFront/, 'server must enforce consent');
assert.match(intake, /moderatePhoto\(/, 'preserve safety moderation');
assert.match(intake, /purpose !== 'flip_card'/, 'reselecting older upload must republish');
assert.match(front, /setIndex\(0\)/, 'reset card image fallback after replacement');
console.log('Flip-card front replacement regression checks passed.');
