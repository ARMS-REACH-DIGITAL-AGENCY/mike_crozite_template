import 'server-only';
import { writerQuery as query } from '@/lib/dbWriter';
import { canonicalInstagramPostUrl, instagramPostKey } from '@/lib/socialNewsScoutRules';
import { evaluateInstagramNews, scoutModelAvailable } from '@/lib/socialNewsScoutJudge';
import { SCOUT_POLICY_VERSION, SCOUT_ACTIVE_STATUSES, postIsFresh, findAlumniCandidates, approvedNews, scoutHeadline, type ScoutPlayer, type ScoutPost } from '@/lib/socialNewsScoutPolicy';

type Existing = {hsid:string;playerid:string|null;url:string};
type NewsContext = {hsid:string;playerid:string;title:string;published_at:string};
type Prior = {postid:string};
export type ScoutReport = {
  scanned:number;signals:number;matched:number;alreadyCovered:number;
  published:number;previewCandidates:number;unresolved:number;failures:number;
  aiReviewed:number;ignored:number;alreadyEvaluated:number;aiUnavailable:number;activeRoster:number;
};
const MAX_AI_PER_RUN = 20;
const MAX_PUBLISH_PER_RUN = 10;
const key = (hsid:string,playerid:string,url:string) => {
  const code=instagramPostKey(url);
  return code ? [hsid,playerid,code].join(':') : null;
};

export async function scoutSocialNews({dryRun=false}:{dryRun?:boolean}={}):Promise<ScoutReport> {
  const report:ScoutReport={scanned:0,signals:0,matched:0,alreadyCovered:0,
    published:0,previewCandidates:0,unresolved:0,failures:0,aiReviewed:0,
    ignored:0,alreadyEvaluated:0,aiUnavailable:0,activeRoster:0};
  const schoolIds=[...new Set((process.env.SOCIAL_NEWS_SCOUT_HSIDS||'5004')
    .split(',').map(x=>x.trim()).filter(x=>/^\d+$/.test(x)))];
  if(!schoolIds.length) return report;
  const writeAudit = async (post:ScoutPost,outcome:string,subject:string|null) => {
    if(dryRun) return;
    await query(`INSERT INTO fan_activity(firebase_uid,action,playerid,hsid,details)
      VALUES('system:social-news-scout','social_news_scout_evaluated',$1,$2,$3::jsonb)`,
      [post.playerid,post.hsid,JSON.stringify({policyVersion:SCOUT_POLICY_VERSION,
        postId:post.id,outcome,subjectPlayerId:subject,sourceHandle:post.handle,
        sourceUrl:post.permalink,originalPublishedAt:post.published_at})]);
  };
  try {
    if(!scoutModelAvailable()) {
      report.aiUnavailable++;
      console.error('[social-news-scout] no AI model configured; fail closed');
      return report;
    }
    const [posts,roster,articles,tips,context,decisions]=await Promise.all([
      query<ScoutPost>(`
        SELECT p.id::text,s.hsid::text,s.playerid::text,s.owner_type,
          s.handle,p.permalink,p.caption,p.published_at::text,p.thumbnail_url
        FROM social_posts p JOIN social_sources s ON s.id=p.social_source_id
        WHERE s.platform='instagram' AND s.status='active' AND s.external_account_id IS NOT NULL
          AND s.hsid::text=ANY($1::text[])
          AND p.permalink IS NOT NULL AND p.published_at>=now()-interval '7 days'
          AND p.published_at<=now()+interval '5 minutes'
        ORDER BY p.published_at DESC LIMIT 350`,[schoolIds]),
      query<ScoutPlayer>(`
        SELECT f.hsid::text,f.playerid::text,f.first_name,f.last_name,f.current_team_name,
          f.status_label,array_remove(array_agg(DISTINCT lower(s.handle)),NULL) AS handles
        FROM flip_card_front_stage f LEFT JOIN social_sources s ON
          s.hsid=f.hsid AND s.playerid=f.playerid AND s.status='active'
        WHERE f.hsid::text=ANY($1::text[]) AND f.status_label=ANY($2::text[])
        GROUP BY f.hsid,f.playerid,f.first_name,f.last_name,f.current_team_name,f.status_label`,
        [schoolIds,[...SCOUT_ACTIVE_STATUSES]]),
      query<Existing>(`SELECT hsid::text,playerid::text,url FROM news_articles
        WHERE hsid::text=ANY($1::text[]) AND playerid IS NOT NULL
        AND url ILIKE '%instagram.com/%'`,[schoolIds]),
      query<Existing>(`SELECT matched_hsid::text AS hsid,matched_playerid::text AS playerid,
        article_url AS url FROM news_tip_queue WHERE matched_hsid::text=ANY($1::text[])
        AND matched_playerid IS NOT NULL AND article_url ILIKE '%instagram.com/%'`,[schoolIds]),
      query<NewsContext>(`
        SELECT hsid::text,playerid::text,title,published_at::text FROM news_articles
        WHERE hsid::text=ANY($1::text[]) AND playerid IS NOT NULL
        AND verification_status='VERIFIED' AND published_at>=now()-interval '30 days'
        ORDER BY published_at DESC LIMIT 600`,[schoolIds]),
      query<Prior>(`SELECT details->>'postId' AS postid FROM fan_activity
        WHERE firebase_uid='system:social-news-scout' AND action='social_news_scout_evaluated'
        AND details->>'policyVersion'=$1 AND created_at>=now()-interval '10 days'`,
        [SCOUT_POLICY_VERSION]),
    ]);
    report.activeRoster=roster.rows.length;
    const covered=new Set([...articles.rows,...tips.rows]
      .map(row=>row.playerid?key(row.hsid,row.playerid,row.url):null).filter(Boolean));
    const seen=new Set(decisions.rows.map(row=>row.postid));
    for(const post of posts.rows){
      report.scanned++;
      const url=canonicalInstagramPostUrl(post.permalink);
      if(!url || !postIsFresh(post.published_at)) continue;
      const candidates=findAlumniCandidates(post,roster.rows);
      if(!candidates.length){report.unresolved++;continue;}
      if(seen.has(post.id)){report.alreadyEvaluated++;continue;}
      if(candidates.every(p=>covered.has(key(p.hsid,p.playerid,url)||''))){
        report.alreadyCovered++; await writeAudit(post,'already_covered',null); continue;
      }
      if(report.aiReviewed+report.aiUnavailable>=MAX_AI_PER_RUN || report.published>=MAX_PUBLISH_PER_RUN) break;
      const previousNews=context.rows.filter(n=>candidates.some(p=>n.hsid===p.hsid&&n.playerid===p.playerid))
        .slice(0,16).map(n=>({title:n.title,published_at:n.published_at}));
      const verdict=await evaluateInstagramNews({post,candidates,previousNews});
      if(!verdict){report.aiUnavailable++;report.failures++;continue;}
      report.aiReviewed++;
      if(verdict.decision==='publish') report.signals++;
      if(!approvedNews(verdict,candidates)){
        report.ignored++;await writeAudit(post,'ignored',verdict.subject_playerid||null);continue;
      }
      const player=candidates.find(p=>p.playerid===verdict.subject_playerid)!;
      const unique=key(player.hsid,player.playerid,url);
      if(!unique||covered.has(unique)){
        report.alreadyCovered++;await writeAudit(post,'already_covered',player.playerid);continue;
      }
      report.matched++;
      if(dryRun){report.previewCandidates++;continue;}
      const name=(player.first_name+' '+player.last_name).trim();
      const shortcode=instagramPostKey(url)!;
      const headline=scoutHeadline(player,verdict.headline);
      const summary=verdict.summary.slice(0,700);
      const notes=JSON.stringify({kind:'clip',title:headline,source:'social_scout',
        postId:post.id,sourceHandle:post.handle,originalPublishedAt:post.published_at,
        category:verdict.category,confidence:verdict.confidence,
        evidence:verdict.evidence,captionExcerpt:(post.caption||'').slice(0,700)});
      try {
        const result=await query<{uuid:string}>(`
          WITH created_story AS (
            INSERT INTO news_articles
              (uuid,playerid,player_name,hsid,title,source,published_at,url,
               image_url,display_image_url,image_verification_status,
               snippet,local_recap,discovery_source,verification_status,
               verification_reason,newsworthiness,raw_payload)
            SELECT md5('social_scout:'||$2::text||':'||$3::text||':'||$4::text),
              $2,$5,$3,$6,'instagram.com',p.published_at,$7,
              p.thumbnail_url,p.thumbnail_url,
              CASE WHEN p.thumbnail_url IS NULL THEN 'FALLBACK_PLAYER'
                   ELSE 'SOURCE_VERIFIED' END,
              $8,$8,'social_scout','VERIFIED',
              'AI verified a recent relevant event about this active alumnus',
              'NORMAL',$9::jsonb
            FROM social_posts p
            WHERE p.id=$1::bigint AND p.published_at>=now()-interval '7 days'
              AND NOT EXISTS (SELECT 1 FROM news_articles n
                WHERE n.playerid=$2 AND n.hsid=$3 AND strpos(n.url,$4)>0)
              AND NOT EXISTS (SELECT 1 FROM news_tip_queue t
                WHERE t.matched_playerid=$2 AND t.matched_hsid=$3
                  AND strpos(t.article_url,$4)>0)
            ON CONFLICT(uuid) DO NOTHING RETURNING uuid
          ), recorded_tip AS (
            INSERT INTO news_tip_queue
              (intake_source,sender_name,sender_role,raw_player_name,
               matched_playerid,matched_hsid,matched_confidence,
               article_url,notes,status,promoted_news_uuid)
            SELECT 'social_scout','YAT?STATS AI News Scout','system',$5,
              $2,$3,$10,$7,$11,'published',story.uuid
            FROM created_story story ON CONFLICT DO NOTHING RETURNING id
          )
          SELECT uuid FROM created_story`,[
          post.id,player.playerid,player.hsid,shortcode,name,headline,url,summary,
          JSON.stringify({source:'social_scout',socialPostId:post.id,sourceHandle:post.handle,
            category:verdict.category,originalPublishedAt:post.published_at,
            originalUrl:url,confidence:verdict.confidence,
            evidence:verdict.evidence,policyVersion:SCOUT_POLICY_VERSION}),
          verdict.confidence,notes
        ]);
        if(result.rows.length) report.published++;else report.alreadyCovered++;
        covered.add(unique);
        await writeAudit(post,result.rows.length?'published':'already_covered',player.playerid);
      }catch(error){
        report.failures++;
        console.error('[social-news-scout] post publish failed',{
          postId:post.id,error:error instanceof Error?error.message:'unknown'});
      }
    }
    return report;
  }finally{
    if(!dryRun){
      try{
        await query(`INSERT INTO fan_activity(firebase_uid,action,hsid,details)
          VALUES('system:social-news-scout','social_news_scout_run',$1,$2::jsonb)`,
          [schoolIds.length===1?schoolIds[0]:null,
           JSON.stringify({policyVersion:SCOUT_POLICY_VERSION,schools:schoolIds,
             ...report,completedAt:new Date().toISOString()})]);
      }catch(error){
        report.failures++;
        console.error('[social-news-scout] heartbeat audit failed',error);
      }
    }
    console.info('[social-news-scout] scan complete',report);
  }
}
