import 'server-only';
import { query } from '@/lib/db';

type SchoolPost = { post_id: string; caption: string; permalink: string | null; hsid: string; source_handle: string };
type Player = { playerid: string; first_name: string; last_name: string; class_of: string | null };
type Linked = { handle: string; playerid: string | null };
type Candidate = { playerid: string | null; score: number; match: string };
type Result = { posts: number; handles: number; alreadyLinked: number; autoConnected: number; reviewCandidates: number; failed: number };

// Only process publicly tagged usernames in content already available to YAT?STATS.
// Instagram Business Discovery cannot read arbitrary people's comments, followers,
// or recommendation lists, so do not attempt to scrape those surfaces.
const mentions = /(?:^|[^A-Za-z0-9_.])@([A-Za-z0-9._]{2,30})(?![A-Za-z0-9._])/g;
const key = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
const isHandle = (v: string) => /^[a-zA-Z0-9._]{2,30}$/.test(v) && !v.includes('..');

function choosePlayer(handle: string, roster: Player[]): Candidate {
  const normalized = key(handle);
  const matches = roster.map(p => {
    const full = key(p.first_name + p.last_name);
    const reversed = key(p.last_name + p.first_name);
    const initialLast = key(p.first_name.slice(0, 1) + p.last_name);
    const last = key(p.last_name);
    const first = key(p.first_name);
    let score = 0;
    let match = 'no-match';
    if (normalized === full || normalized === reversed) { score = 0.99; match = 'exact-full-name'; }
    else if (normalized.startsWith(full) && /^[0-9]{1,3}$/.test(normalized.slice(full.length))) { score = 0.94; match = 'full-name-plus-digits'; }
    else if (normalized === initialLast) { score = 0.75; match = 'first-initial-and-last'; }
    else if (last.length >= 5 && normalized.includes(last) && normalized.startsWith(first.slice(0, 1))) { score = 0.65; match = 'partial-name'; }
    return { playerid: p.playerid, score, match };
  }).filter(v => v.score > 0).sort((a, b) => b.score - a.score);
  // Never guess when two players would match the same handle equally.
  if (matches.length === 0 || (matches[1] && matches[0].score === matches[1].score))
    return { playerid: null, score: 0, match: 'unresolved' };
  return matches[0];
}

export async function discoverSocialHandles(maxPosts=200): Promise<Result> {
  const outcome: Result = { posts: 0, handles: 0, alreadyLinked: 0, autoConnected: 0, reviewCandidates: 0, failed: 0 };
  const posts = await query<SchoolPost>(`
    SELECT p.id::text AS post_id, p.caption, p.permalink, s.hsid, s.handle AS source_handle
    FROM social_posts p JOIN social_sources s ON s.id=p.social_source_id
    WHERE s.platform='instagram' AND s.owner_type='school' AND s.status='active'
      AND s.hsid IS NOT NULL AND p.caption LIKE '%@%'
    ORDER BY p.published_at DESC LIMIT $1`,[Math.min(400,Math.max(1,maxPosts))]);
  const known = await query<Linked>("SELECT lower(handle) AS handle, playerid FROM social_sources WHERE platform='instagram'");
  const accounts = new Map(known.rows.map(r=>[r.handle.toLowerCase(),r.playerid]));
  const roster = new Map<string,Player[]>();
  const rosterYear = new Map<string,string|null>();
  const processed = await query<{ post_id:string; handle:string }>(`
    SELECT details->>'source_post_id' AS post_id, lower(details->>'handle') AS handle
    FROM fan_activity WHERE action='social_handle_candidate'
      AND created_at >= now() - interval '2 years' LIMIT 10000`);
  const seen = new Set(processed.rows.map(r=>r.post_id+'|'+r.handle));
  for (const post of posts.rows) {
    outcome.posts++;
    if (!roster.has(post.hsid)) {
      const rows = await query<Player>("SELECT playerid,first_name,last_name,class_of FROM flip_card_front_stage WHERE hsid=$1",[post.hsid]);
      roster.set(post.hsid,rows.rows);
      for (const p of rows.rows) rosterYear.set(p.playerid,p.class_of);
    }
    const local = new Set<string>();
    for (const match of post.caption.matchAll(mentions)) {
      const handle=match[1];
      const lower=handle.toLowerCase();
      if (!isHandle(handle) || local.has(lower) || lower===post.source_handle.toLowerCase()) continue;
      local.add(lower);
      if (seen.has(post.post_id+'|'+lower)) continue;
      outcome.handles++;
      try {
        let linked = accounts.has(lower);
        let added = false;
        const candidate = choosePlayer(handle,roster.get(post.hsid) || []);
        const graduation = candidate.playerid ? rosterYear.get(candidate.playerid) : null;
        const year = graduation && /^\\d{4}$/.test(graduation) ? Number(graduation) : NaN;
        // Official-school tag + exact full name + graduated at least three
        // calendar years ago. Ambiguous and current students remain candidates.
        if (!linked && candidate.playerid && candidate.match==='exact-full-name' &&
          Number.isInteger(year) && year <= new Date().getFullYear()-3) {
          const saved = await query<{id:string}>(`
            INSERT INTO social_sources(platform,handle,owner_type,hsid,playerid,authorization_type,status)
            SELECT 'instagram',$1,'player',$2,$3,'school_caption_identity_match','active'
            WHERE NOT EXISTS (SELECT 1 FROM social_sources WHERE platform='instagram' AND lower(handle)=lower($1))
            ON CONFLICT(platform,handle) DO NOTHING RETURNING id::text`,[handle,post.hsid,candidate.playerid]);
          added = Boolean(saved.rows.length);
          if (added) {accounts.set(lower,candidate.playerid);outcome.autoConnected++;}
          else linked = true;
        }
        if (linked) outcome.alreadyLinked++;
        if (!linked && !added) outcome.reviewCandidates++;
        const status = added?'auto_connected':linked?'already_registered':'needs_review';
        const details={
          platform:'instagram',handle,source_post_id:post.post_id,
          source_post_url:post.permalink,source_account:post.source_handle,
          score:candidate.score,match_method:candidate.match,status,
          note:'Official school post tag. Not an Instagram comment/follower scrape.'
        };
        // Append-only audit/event data: the service role already has INSERT
        // permissions, and a post + handle pair is safe to re-run.
        await query(`
          INSERT INTO fan_activity(firebase_uid,action,playerid,hsid,details)
          SELECT 'system:social-discovery','social_handle_candidate',$1,$2,$3::jsonb
          WHERE NOT EXISTS (
            SELECT 1 FROM fan_activity WHERE action='social_handle_candidate'
              AND details->>'source_post_id'=$4
              AND lower(details->>'handle')=$5
          )`,
          [candidate.playerid,post.hsid,JSON.stringify(details),post.post_id,lower]);
        seen.add(post.post_id+'|'+lower);
      } catch (error) {
        outcome.failed++;
        console.error('[social-discovery] candidate processing failed',{sourcePostId:post.post_id,error:String(error)});
      }
    }
  }
  return outcome;
}
