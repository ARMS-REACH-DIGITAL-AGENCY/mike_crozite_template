// Regression (Pete, Nov 12 2026): on phones the account panel's last item,
// Sign Out, sat behind the fixed footer + ticker and could not be scrolled
// into view. It must keep footer-height room below it inside the panel's own
// scroll region (#drawerAccount > .yat-account-content scrolls; the aside
// hides overflow).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

const drawer = read('src/components/AccountDrawer.tsx');
const phone = drawer.match(/@media \(max-width:779px\)\{#drawerAccount \.yat-account-signout\{[^}]*\}\}/);
assert.ok(phone, 'Sign Out has a phone-only rule');
assert.match(phone[0], /margin-bottom:calc\(var\(--footerH, 56px\) \+ \d+px \+ env\(safe-area-inset-bottom, 0px\)\)!important/, 'on phones Sign Out keeps footer-height room below it');
const base = drawer.match(/^\s*#drawerAccount \.yat-account-signout\{[^}]*\}/m);
assert.ok(base && /margin-bottom:0!important/.test(base[0]), 'wider layouts keep no extra blank tail');

// Sign Out stays the last control in the signed-in panel, inside the scroller.
const signedIn = drawer.slice(drawer.indexOf('<GuidedTourArtwork />'));
assert.ok(signedIn.indexOf('className="yat-account-signout"') > 0, 'Sign Out follows the tour card');
assert.match(drawer, /<div className="yat-drawer-content yat-account-content">/, 'the panel content is the scroll region');
const layout = read('src/components/yatstats/DrawerLayoutOverrides.tsx');
assert.match(layout, /#drawerAccount > \.yat-account-content,[\s\S]*?overflow-y:auto!important/, 'the account content scrolls');
console.log('account sign-out clearance: ok');
