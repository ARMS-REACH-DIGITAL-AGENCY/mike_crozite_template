/** Isolated newsletter architecture contract tests; no network or email. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sql = fs.readFileSync('migrations/20261026_tribune_unified_delivery.sql','utf8');
for (const token of [
 'newsletter_deliveries', 'newsletter_delivery_attempts', 'newsletter_preferences',
 'newsletter_control', "publication_type IN ('daily','weekly')",
 'UNIQUE(firebase_uid,publication_type,report_start,report_end)',
 'provider_message_id', 'unsubscribed_all_at',
 'GRANT SELECT ON tribune_private.newsletter_control',
]) assert.ok(sql.includes(token), 'missing schema contract: '+token);
assert.ok(!/GRANT\s+UPDATE\s+ON\s+tribune_private\.newsletter_control/i.test(sql));
assert.ok(/enabled boolean NOT NULL DEFAULT false/.test(sql));
assert.ok(/daily_enabled boolean NOT NULL DEFAULT false/.test(sql));
assert.ok(/weekly_enabled boolean NOT NULL DEFAULT false/.test(sql));
assert.ok(!/DROP\s+(TABLE|SCHEMA)/i.test(sql));
console.log('Isolated newsletter schema contract: PASS');
