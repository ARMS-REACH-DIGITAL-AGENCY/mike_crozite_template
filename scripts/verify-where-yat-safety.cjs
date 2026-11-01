// Release Wave 2 safety contract for Where YAT Now (Nov 1, 2026).
const fs = require('fs');
const assert = require('assert/strict');
const read = (p) => fs.readFileSync(p, 'utf8');

// Outside deliveries are off unless switched on, and every path checks.
const sw = read('src/lib/whereYatSwitches.ts');
assert.match(sw, /VERCEL_ENV !== 'production'\) return false/, 'switches are production-only');
assert.match(sw, /WHERE_YAT_CRM_SYNC_ENABLED/, 'CRM switch exists');
assert.match(sw, /WHERE_YAT_EMAILS_ENABLED/, 'email/SMS switch exists');
assert.match(sw, /_ONLY_IDS/, 'single-record allowlist exists');
assert.match(read('src/lib/whereYatArmsSync.ts'), /if\(process\.env\.VERCEL_ENV!=='production'\|\|!whereYatCrmSyncAllowed\(id\)\)return false;/, 'CRM sync checks its switch first');
assert.match(read('src/lib/whereYatReviewNotifications.ts'), /!whereYatEmailsAllowed\(info\.id\)/, 'reviewer alerts check the email switch');
assert.match(read('src/lib/whereYatContributorNotifications.ts'), /if\(!whereYatEmailsAllowed\(info\.id\)\)return false;/, 'alumni receipts check the email switch');
assert.match(read('src/app/api/cron/where-yat-arms-sync/route.ts'), /if\(!whereYatAnyDeliveryOn\(\)\)return NextResponse\.json/, 'cron does no queries while switched off');

// Same answers and files from the same account are saved once.
const route = read('src/app/api/contribute/where-yat-now/route.ts');
assert.match(route, /createHash\('sha256'\)/, 'submission fingerprint');
assert.match(route, /where_yat_submit_started/, 'in-progress marker');
assert.match(route, /duplicate: true/, 'repeat returns the first receipt');
assert.match(route, /where_yat_submit_failed/, 'failures release the guard');
const afterMarker = route.slice(route.indexOf("'where_yat_submit_started', $2"));
assert.doesNotMatch(afterMarker.slice(afterMarker.indexOf('\n  try {')), /return reply\(/, 'every early exit after the marker releases the guard');

// The bracket keeps its own fonts (Pete's bracket rules: no unapproved layout change).
assert.match(read('src/components/bracket/SchoolBracket.tsx'), /Roboto_Condensed\(\{ subsets: \['latin'\], variable: '--yfp-sb'/, 'bracket scoreboard font');
assert.match(read('src/components/bracket/BracketTicker.tsx'), /Doto\(\{ subsets: \['latin'\], weight: \['700', '900'\]/, 'bracket ticker font');

console.log('PASS Where YAT Now safety: delivery switches, double-submit guard, bracket fonts');

// After a successful submit (including an edit) the receipt must show.
const form = read('src/components/yatstats/WhereYatClaimForm.tsx');
assert.match(form, /setReceipt\(Number\(result\.submissionId\)\);\s*\/\/[^\n]*\n\s*setEditEnabled\(false\);/, 'edit mode ends after a successful submit');
assert.match(route, /await Promise\.all\(images\.map/, 'images are moderated in parallel');
console.log('PASS Where YAT Now receipt after edit, parallel image checks');
