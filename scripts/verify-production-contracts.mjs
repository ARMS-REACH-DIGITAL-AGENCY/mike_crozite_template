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

const profile=readFileSync('src/app/[hsid]/player/[playerId]/[slug]/page.tsx','utf8');
const school=readFileSync('src/components/yatstats/NewsGallery.tsx','utf8');
const tower=readFileSync('src/components/yatstats/SponsorTower.tsx','utf8');
const globalCss=readFileSync('src/app/globals.css','utf8');
assert(profile.includes('<SponsorTower placement="player-news"'), 'Player News must use shared desktop sponsor tower');
assert(feed.includes('<SponsorTower placement="player-stories"'), 'Player Stories must use shared desktop sponsor tower');
assert(school.includes('<SponsorTower placement="school-news"'), 'School News must use shared desktop sponsor tower');
assert(tower.includes('data-yat-sponsor-slot="300x600"'), 'Sponsor tower size contract missing');
assert(globalCss.includes('.yat-desktop-sponsor-tower'), 'Shared tower CSS missing');
console.log('Shared 300x600 sponsor contracts passed');

assert(profile.includes('<SponsorTower placement="player-connect"'), 'Player Connect must use shared desktop sponsor tower');
assert(profile.includes('#ppTab-connect .yp-player-video-placeholder'), 'Connect video needs constrained left-column layout');
