import 'server-only';
import { query } from '@/lib/db';
import { canonicalInstagramPostUrl, classifySocialNewsCaption, instagramPostKey, socialNewsHeadline } from '@/lib/socialNewsScoutRules';

type Post = {
  id: string; hsid: string; playerid: string | null; owner_type: string;
  handle: string; permalink: string; caption: string; published_at: string | null;
};
type Player = { hsid: string; playerid: string; handle: string; first_name: string; last_name: string };
type Existing = { hsid: string; playerid: string | null; url: string };
export type ScoutReport = {
  scanned: number; signals: number; matched: number; alreadyCovered: number;
  queued: number; previewCandidates: number; unresolved: number; failures: number;
};

function postPlayerKey(hsid: string, playerid: string, url: string): string | null {
  const shortcode = instagramPostKey(url);
  return shortcode ? \`\${hsid}:\${playerid}:\${shortcode}\` : null;
}

// Server job only. Uses professionally available media already synchronized
// through Meta Business Discovery, never a personalized feed or private posts.
// The same code works for every school; only registered source accounts run.
export async function scoutSocialNews({ dryRun = false }: { dryRun?: boolean } = {}): Promise<ScoutReport> {
  const report: ScoutReport = {
    scanned: 0, signals: 0, matched: 0, alreadyCovered: 0,
    queued: 0, previewCandidates: 0, unresolved: 0, failures: 0,
  };
  const [posts, players, existingArticles, existingTips] = await Promise.all([
    query<Post>(\`
      SELECT p.id::text, s.hsid::text, s.playerid::text, s.owner_type,
             s.handle, p.permalink, p.caption, p.published_at
      FROM social_posts p JOIN social_sources s ON s.id = p.social_source_id
      WHERE s.platform='instagram' AND s.status='active' AND s.hsid IS NOT NULL
        AND s.external_account_id IS NOT NULL
        AND p.caption IS NOT NULL AND p.permalink IS NOT NULL
        AND p.published_at >= now() - interval '120 days'
      ORDER BY p.published_at DESC LIMIT 350\`),
    query<Player>(\`
      SELECT s.hsid::text, s.playerid::text, lower(s.handle) AS handle,
             f.first_name, f.last_name
      FROM social_sources s JOIN flip_card_front_stage f
        ON f.playerid::text = s.playerid::text AND f.hsid::text = s.hsid::text
      WHERE s.platform='instagram' AND s.status='active' AND s.owner_type='player'
        AND s.hsid IS NOT NULL AND s.playerid IS NOT NULL\`),
    query<Existing>(\`SELECT hsid::text, playerid::text, url FROM news_articles
      WHERE playerid IS NOT NULL AND url ILIKE '%instagram.com/%'\`),
    query<Existing>(\`SELECT matched_hsid::text AS hsid, matched_playerid::text AS playerid,
      article_url AS url FROM news_tip_queue
      WHERE matched_playerid IS NOT NULL AND article_url ILIKE '%instagram.com/%'\`),
  ]);
  const byPlayer = new Map<string, Player>();
  const byHandle = new Map<string, Player>();
  for (const player of players.rows) {
    byPlayer.set(\`\${player.hsid}:\${player.playerid}\`, player);
    byHandle.set(\`\${player.hsid}:\${player.handle.toLowerCase()}\`, player);
  }
  const covered = new Set<string>();
  for (const { hsid, playerid, url } of [...existingArticles.rows, ...existingTips.rows]) {
    if (playerid) {
      const key = postPlayerKey(hsid, playerid, url);
      if (key) covered.add(key);
    }
  }
  const encountered = new Set<string>();
  for (const post of posts.rows) {
    report.scanned++;
    const signal = classifySocialNewsCaption(post.caption);
    const permalink = canonicalInstagramPostUrl(post.permalink);
    if (!signal || !permalink) continue;
    report.signals++;
    const matches: Player[] = [];
    if (post.owner_type === 'player' && post.playerid) {
      const player = byPlayer.get(\`\${post.hsid}:\${post.playerid}\`);
      if (player) matches.push(player);
    } else if (post.owner_type === 'school') {
      // School announcements can mention several registered alumni.
      // Never match an unverified name alone to a school roster member.
      for (const tag of post.caption.matchAll(/(?:^|[^A-Za-z0-9_.])@([A-Za-z0-9._]{2,30})/g)) {
        const player = byHandle.get(\`\${post.hsid}:\${tag[1].toLowerCase()}\`);
        if (player && !matches.some((m) => m.playerid === player.playerid)) matches.push(player);
      }
    }
    if (!matches.length) { report.unresolved++; continue; }
    for (const player of matches) {
      const key = postPlayerKey(player.hsid, player.playerid, permalink);
      if (!key || encountered.has(key)) continue;
      encountered.add(key);
      report.matched++;
      if (covered.has(key)) { report.alreadyCovered++; continue; }
      if (report.queued + report.previewCandidates >= 20) return report;
      if (dryRun) { report.previewCandidates++; continue; }
      const playerName = \`\${player.first_name} \${player.last_name}\`.trim();
      const shortcode = instagramPostKey(permalink)!;
      const notes = JSON.stringify({
        kind: 'clip', title: socialNewsHeadline(playerName, signal.kind),
        why: 'Suggested by automated Instagram News Scout; verify the announcement before publication.',
        source: 'social_scout', postId: post.id, sourceHandle: post.handle,
        originalPublishedAt: post.published_at, category: signal.kind,
        confidence: signal.confidence, evidence: signal.clue,
        captionExcerpt: post.caption.slice(0, 700),
      });
      try {
        const { rows } = await query<{ id: string }>(\`
          INSERT INTO news_tip_queue
            (intake_source, sender_name, sender_role, raw_player_name,
             matched_playerid, matched_hsid, matched_confidence,
             article_url, notes, status)
          SELECT 'social_scout','YAT?STATS News Scout','system',$1,$2,$3,$4,$5,$6,'needs_review'
          WHERE NOT EXISTS (
            SELECT 1 FROM news_tip_queue q WHERE q.matched_playerid=$2
              AND q.matched_hsid=$3 AND strpos(q.article_url,$7)>0
          ) AND NOT EXISTS (
            SELECT 1 FROM news_articles n WHERE n.playerid=$2
              AND n.hsid=$3 AND strpos(n.url,$7)>0
          )
          ON CONFLICT DO NOTHING RETURNING id::text\`,
          [playerName, player.playerid, player.hsid, signal.confidence,
           permalink, notes, shortcode]);
        if (rows.length) report.queued++;
        else report.alreadyCovered++;
        covered.add(key);
      } catch (error) {
        report.failures++;
        console.error('[social-news-scout] candidate failed', {postId: post.id, playerId: player.playerid, error: String(error)});
      }
    }
  }
  return report;
}
