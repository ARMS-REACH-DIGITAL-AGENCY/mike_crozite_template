'use strict';
// home.yatstats.com (the old GoHighLevel page) is retired and forwards to
// yatstats.com (Pete, Nov 18 2026). The site links straight to yatstats.com.
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const hits = execSync("grep -rln 'home\\.yatstats\\.com' src || true").toString().trim();
assert.equal(hits, '', 'no link to the retired home.yatstats.com:\n' + hits);
console.log('no links to retired home.yatstats.com');
