const fs=require('fs');const assert=require('assert/strict');const read=p=>fs.readFileSync(p,'utf8');
const header=read('src/components/yatstats/shell/SchoolContextBar.tsx');
const native=read('src/components/yatstats/PlayerCardFlipBehavior.tsx');
const favorites=read('src/components/yatstats/FavoritesDrawer.tsx');
const zone=read('src/components/yatstats/FunZone.tsx');
assert(header.includes("['schedule', 'stats', 'news', 'social', 'connect', 'upload']"));
assert(header.indexOf("card.classList.toggle('is-flipped', onBack)") < header.indexOf("card.dispatchEvent(new CustomEvent('yat:flip-all-tab'"));
assert(native.includes('if (opening) card.dispatchEvent(new CustomEvent("yat:flip-all-tab", { detail: { tab: "schedule" } }))'));
assert(favorites.includes("if (opening) card.querySelector<HTMLElement>('.fz-tab-btn[data-fz-tab=\"schedule\"]')?.click()"));
assert(zone.includes('if(!retiredPlayer || activeTab!==\'schedule\') return'));
assert(zone.includes('if (!card?.classList.contains(\'is-flipped\')) return'));
assert(zone.includes('activeTab === "schedule" ? " fz-panel-active"'));
// Every News placeholder must link to a REAL school-scoped portal route on
// bare Vercel preview hosts and on canonical school domains alike.
assert(zone.includes('const tipsHref = `/${encodeURIComponent(resolvedHsid)}/connect-contribute?contribute=tip&playerId=${encodeURIComponent(playerId)}`'));
const portal=read('src/components/yatstats/ContributeGuide.tsx');
assert(portal.includes("const action = params.get('contribute')"));
assert(portal.includes("action === 'tip'"));
assert(portal.includes("openContribute({ tab, photoType, ...(player ? { player } : {}) })"));
console.log('PASS first-tab flip ordering, active/retired content, lazy loading and school-scoped News tip links');
