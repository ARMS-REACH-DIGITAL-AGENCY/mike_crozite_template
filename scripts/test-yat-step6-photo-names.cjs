'use strict';
// YAT key step 6 (Pete, Nov 19 2026): player photo files are named by the YAT
// ID (players/now/YAT000001.jpg). The site builds photo addresses from the
// YAT ID, and the MLB headshot job and fan uploads save under it. The card
// number is only the fallback for a row with no YAT ID.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (f) => fs.readFileSync(f, 'utf8');
assert.match(read('src/lib/playerImage.ts'), /export function playerPhotoId\(yatid: unknown, playerid\?: unknown\)/, 'one photo-id rule');
// Step 9: the YAT ID comes from the YAT Registry link itself (yat_mlb_links).
assert.match(read('scripts/import-mlb-headshots-s3.py'), /f\.display_name, f\.level_label, f\.hsid, m\.yatid/, 'MLB job reads the YAT ID');
assert.match(read('scripts/import-mlb-headshots-s3.py'), /players\/season-headshots\/\{pid\}_\{SEASON\}\.jpg/, 'MLB job saves by YAT ID');
assert.match(read('src/lib/contributeServer.ts'), /const pid = await photoFileId\(u\.playerid\);/, 'fan uploads save by YAT ID');
assert.match(read('src/components/yatstats/PlayerCard.tsx'), /const photoId = playerPhotoId\(p\.yatid, playerId\);/, 'gallery cards read by YAT ID');
assert.match(read('src/components/yatstats/ZoomableCareerTimeline.tsx'), /const photo = photoId \|\| playerId;/, 'timeline reads by YAT ID');
assert.match(read('scripts/yat-step6-photo-names.py'), /MODE not in \("report", "copy", "copy_all", "catch_up"\)/, 'hourly catch-up exists');
console.log('yat step 6 photo names OK');
