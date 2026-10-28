// Structural regression contracts; complement with browser E2E tests.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const feed=readFileSync('src/components/yatstats/StoriesFeed.tsx','utf8');
const news=readFileSync('src/components/yatstats/NewsEngagement.tsx','utf8');
const share=readFileSync('src/app/[hsid]/page.tsx','utf8');
assert(!/yearFilter\s*!==\s*null[\s\S]{0,100}:\s*!s\.timelineOnly/.test(feed), 'Archive championship stories hidden by default');
assert(feed.includes('ysf-sponsor-column'), 'Missing desktop sponsor column');
assert(feed.includes('grid-template-columns'), 'Missing desktop Stories+Sponsor grid');
assert(news.includes('hasValidSession'), 'News actions must check real authentication');
assert(share.includes('qp.story'), 'Missing article-specific News share metadata');
console.log('Protected source contracts passed');
