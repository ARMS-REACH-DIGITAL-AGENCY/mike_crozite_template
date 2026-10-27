import 'server-only';
import { createHash } from 'crypto';
import { query } from '@/lib/db';
import { publishCollegeCommitment } from '@/lib/publishCollegeCommitment';
import { resolveCanonicalCurrentTeam } from '@/lib/publishCurrentTeamChange';
import { revalidateTag } from 'next/cache';
import { parseNewsVideo, cleanNewsVideoTitle, isLegacyVideoPlaceholderTitle } from '@/lib/newsVideo';
import { fetchYouTubeVideoTitle } from '@/lib/youtubeVideoTitle';
import { highSchoolTeamId, yatPlayerId } from '@/lib/yatIds';

type Tip = { id: string; intake_source: string; matched_playerid: string | null; matched_hsid: string | null; raw_player_name: string | null; article_url: string; notes: string | null };
type Missing = { id: string; hsid: string; player_name: string; grad_year: number | null; notes: string | null };
type Outcome = { published: number; review: number; failed: number };
// Track a completed queue record in the existing append-only audit log, avoiding
// UPDATE privileges on the publicly writable intake table.
async function markTip(t:Tip,status:'published'|'needs_review',reason:string) {
 await query(`INSERT INTO fan_activity(firebase_uid,action,playerid,hsid,details)
 VALUES('system:contribution-publisher','contribute_processed',$1,$2,$3::jsonb)`,
 [t.matched_playerid,t.matched_hsid,JSON.stringify({queue_id:t.id,status,reason})]);
}
const handle = (v: string) => v.trim().replace(/^@/, '').replace(/^https?:\/\/(?:www\.)?(?:instagram\.com|x\.com|twitter\.com)\//i,'').replace(/[/?#].*$/,'');
const clip = (url: string) => /^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?|youtube\.com\/shorts\/|youtu\.be\/|instagram\.com\/(?:p|reel)\/|facebook\.com\/|fb\.watch\/|milb\.com\/)/i.test(url);
const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0,32);
function parsed(v: string | null): Record<string, unknown> | null { try { const x=JSON.parse(v || ''); return x && typeof x==='object' && !Array.isArray(x) ? x : null; } catch { return null; } }
function year(v: unknown) { const y=Number(v); return Number.isInteger(y) && y>=1900 && y<=new Date().getFullYear()+1 ? String(y) : null; }
// Accept only explicit four-digit varsity season evidence. No graduation-year
// inference: those seasons must be selected by the contributor.
export function normalizeSubmittedVarsityYears(input: unknown): string[] | null {
 if (!Array.isArray(input) || input.length < 1 || input.length > 30) return null;
 const values = input.map((v) => typeof v === 'string' ? v.trim() : '');
 const maxYear = new Date().getFullYear() + 1;
 if (values.some((v) => !/^\d{4}$/.test(v) || Number(v) < 1900 || Number(v) > maxYear)) return null;
 return [...new Set(values)].sort((a,b) => Number(a)-Number(b));
}

function canPublishVarsityYears(
 requested: string[], existing: unknown, classOf: unknown, statusLabel: unknown
): boolean {
 const isCoach = /(?:^|[ -])COACH(?:$|[ -])/i.test(String(statusLabel || ''));
 if (!isCoach && requested.length > 6) return false;
 const grad = String(classOf ?? '').trim();
 if (!isCoach && /^\d{4}$/.test(grad) && requested.some((v) => Number(v) > Number(grad))) return false;
 const original = Array.isArray(existing)
   ? existing.flatMap((item) => String(item).split(',')).map((v) => v.trim()).filter(Boolean)
   : [];
 if (!original.length) return true; // fill missing evidence; never replace known rosters
 const previous = normalizeSubmittedVarsityYears(original);
 return !!previous && previous.join(',') === requested.join(',');
}

function rosterYearsWereSubmitted(t: Tip): boolean {
 const meta = parsed(t.notes);
 const fields = meta?.fields;
 return !!fields && typeof fields === 'object' && !Array.isArray(fields)
   && Object.prototype.hasOwnProperty.call(fields,'roster_years');
}

function refreshSchoolAfterYearPublish(t: Tip) {
 if (rosterYearsWereSubmitted(t) && t.matched_hsid && /^\d+$/.test(t.matched_hsid)) {
   // A new team-year plaque and its matching All-Time filter must agree on reload.
   revalidateTag(`school-data:${t.matched_hsid}`, { expire: 0 });
 }
}

async function stage(id: string) {
 const { rows } = await query<{ playerid:string; hsid:string; first_name:string; last_name:string; class_of:string|null; position:string|null; status_label:string|null; roster_years:string[]|null }>(
 'SELECT playerid,hsid,first_name,last_name,class_of,position,status_label,roster_years FROM flip_card_front_stage WHERE playerid=$1 LIMIT 1',[id]);
 return rows[0] || null;
}
async function processCorrection(t:Tip):Promise<boolean> {
 const meta = parsed(t.notes);
 const fields = (meta?.fields && typeof meta.fields === 'object' && !Array.isArray(meta.fields)) ? meta.fields as Record<string,unknown> : {};
 // Existing form submissions were historically queued for manual approval,
 // sometimes together with unrelated corrections. Publish a valid commitment
 // right away; process any remaining fields using the existing verification
 // rules. Also repairs commitments already waiting in the queue.
 if (t.intake_source === 'correction' && t.matched_playerid && t.matched_hsid &&
     (fields.status_label==='COMMIT' || fields.status_label==='UNCOMMITTED') &&
     typeof fields.committed_teamid === 'string') {
   const by = meta?.by && typeof meta.by==='object' && !Array.isArray(meta.by)
     ? meta.by as Record<string,unknown> : {};
   const uid = String(by.uid || '').trim() || 'system:contribution-publisher';
   await publishCollegeCommitment({
     playerId:t.matched_playerid,hsid:t.matched_hsid,
     status:fields.status_label,teamId:fields.committed_teamid,
     contributorUid:uid,source:'queued',queueId:t.id,
   });
   const remaining=Object.fromEntries(Object.entries(fields).filter(([key])=>
     key!=='status_label' && key!=='committed_teamid'));
   if (Object.keys(remaining).length===0) return true;
   // A conflicting name, photo, etc. must not undo the college publication.
   return processCorrection({...t,notes:JSON.stringify({...meta,fields:remaining})});
 }
 const oldGrad = /^\[grad_year\]\s*(\d{4})$/.exec(t.notes || '');
 const requestedYear = year(fields.class_of || oldGrad?.[1]);
 const requestedPosition = typeof fields.position==='string' ? fields.position.trim().toUpperCase() : '';
 const hasRosterYears = Object.prototype.hasOwnProperty.call(fields,'roster_years');
 const requestedRosterYears = hasRosterYears ? normalizeSubmittedVarsityYears(fields.roster_years) : null;
 if (hasRosterYears && !requestedRosterYears) return false;
 const player = t.matched_playerid ? await stage(t.matched_playerid) : null;
 if (!player || (t.matched_hsid && player.hsid!==t.matched_hsid)) return false;
 // Never partially publish a correction when other fields conflict or need human review.
 const keys=Object.keys(fields).filter(k=>fields[k]!==null && fields[k]!==undefined && String(fields[k]).trim());
 if(keys.some(k=>!['class_of','position','instagram','x','roster_years'].includes(k)))return false;
 if(requestedRosterYears && !canPublishVarsityYears(
   requestedRosterYears,player.roster_years,requestedYear || player.class_of,player.status_label
 ))return false;
 if(requestedYear && player.class_of && player.class_of!==requestedYear)return false;
 if(requestedPosition && player.position && player.position!==requestedPosition)return false;
 if(requestedPosition && !/^[A-Z0-9 -]{1,12}$/.test(requestedPosition))return false;
 // Verified legacy data cannot be replaced by unverified fan input.
 if(requestedYear && (!player.class_of || player.class_of===requestedYear)) {
   await query('UPDATE flip_card_front_stage SET class_of=$2,updated_at=now() WHERE playerid=$1 AND (class_of IS NULL OR class_of=$2)',[player.playerid,requestedYear]);
 }
 if(requestedPosition && (!player.position || player.position===requestedPosition)) {
   await query('UPDATE flip_card_front_stage SET position=$2,updated_at=now() WHERE playerid=$1 AND (position IS NULL OR position=$2)',[player.playerid,requestedPosition]);
 }
 if(requestedRosterYears && (!Array.isArray(player.roster_years) || player.roster_years.length===0)) {
   // Do not overwrite a roster added by someone else after the initial read.
   const updated=await query<{playerid:string}>(
     'UPDATE flip_card_front_stage SET roster_years=$2::text[],roster_years_count=cardinality($2::text[]),updated_at=now() WHERE playerid=$1 AND (roster_years IS NULL OR cardinality(roster_years)=0) RETURNING playerid',
     [player.playerid,requestedRosterYears]
   );
   if(updated.rows.length!==1)return false;
 }
 for(const platform of ['instagram','x'] as const){
   const raw=fields[platform];
   if(typeof raw!=='string'||!raw.trim())continue;
   const name=handle(raw);
   if(!/^[a-zA-Z0-9._]{1,30}$/.test(name))continue;
   // A handle attached to another player is an exception, not an identity reassignment.
   const existing=await query<{playerid:string|null}>('SELECT playerid FROM social_sources WHERE platform=$1 AND lower(handle)=lower($2) LIMIT 1',[platform,name]);
   if(existing.rows[0] && existing.rows[0].playerid!==player.playerid)return false;
   if(existing.rows.length===0){
     await query("INSERT INTO social_sources(platform,handle,owner_type,hsid,playerid,authorization_type,status) VALUES ($1,$2,'player',$3,$4,'public','active') ON CONFLICT (platform,handle) DO NOTHING",[platform,name,player.hsid,player.playerid]);
   }
 }
 return keys.length>0 || Boolean(oldGrad && requestedYear);
}
async function processTip(t:Tip):Promise<boolean> {
 if(!t.matched_playerid || !t.matched_hsid || !/^https:\/\//i.test(t.article_url))return false;
 const player=await stage(t.matched_playerid);
 if(!player || player.hsid!==t.matched_hsid)return false;
 let u:URL;try{u=new URL(t.article_url)}catch{return false}
 if(!['https:'].includes(u.protocol) || !clip(t.article_url))return false;
 // Do not automatically embed temporary Instagram Stories or unknown external sources.
 // New submissions use a structured title; preserve legacy freeform notes
 // without truncating a fan-authored headline at 150 characters.
 const legacy=(t.notes||'').replace(/^\[(clip|news)\]\s*/,'').trim();
 const detail=parsed(t.notes);
 const title=cleanNewsVideoTitle(typeof detail?.title==='string' ? detail.title : legacy);
 const description=typeof detail?.why==='string' ? detail.why.trim() : '';
 const youtube=parseNewsVideo(t.article_url)?.provider==='YouTube';
 const needsYoutubeTitle=youtube && (!title || (t.intake_source==='manual_seed' && isLegacyVideoPlaceholderTitle(title)));
 const label=(needsYoutubeTitle ? await fetchYouTubeVideoTitle(t.article_url) : null) || title;
 if(!label || (needsYoutubeTitle && isLegacyVideoPlaceholderTitle(label)))return false;
 const permalink=t.article_url;
 const identifier=hash(t.id);
 await query(`INSERT INTO news_articles(uuid,playerid,player_name,hsid,title,source,published_at,url,
   snippet,local_recap,discovery_source,verification_status,verification_reason,newsworthiness,raw_payload)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'contribute','VERIFIED','Fan provided link to named player','NORMAL',$11::jsonb)
   ON CONFLICT(uuid) DO NOTHING`,
   [identifier,player.playerid,`${player.first_name} ${player.last_name}`,player.hsid,label,u.hostname.replace(/^www\./,''),new Date().toISOString(),permalink,description||null,description||null,JSON.stringify({contribution_id:t.id,contributor_source:t.intake_source})]);
 return true;
}
// Used only for a validated, single-field roster-year submission. The same
// checks as the scheduled publisher apply, with one exact queued ID.
export async function publishQueuedVarsityYears(queueId:string):Promise<'published'|'needs_review'|'pending'>{
 try{
   const {rows}=await query<Tip>(`SELECT id::text,intake_source,matched_playerid,matched_hsid,raw_player_name,article_url,notes
     FROM news_tip_queue q WHERE q.id::text=$1 AND q.status='new' AND q.intake_source='correction'
       AND NOT EXISTS(SELECT 1 FROM fan_activity fa WHERE fa.action='contribute_processed' AND fa.details->>'queue_id'=q.id::text)
     LIMIT 1`,[queueId]);
   const item=rows[0];
   if(!item || !rosterYearsWereSubmitted(item)) return 'pending';
   const published=await processCorrection(item);
   await markTip(item,published?'published':'needs_review',published?'validated initial varsity years':'Conflicting or invalid varsity years');
   if(published)refreshSchoolAfterYearPublish(item);
   return published?'published':'needs_review';
 }catch(error){
   console.error('[contribution-publisher] immediate varsity year processing failed',error);
   return 'pending'; // existing cron can retry when available
 }
}

export async function publishPendingContributions(limit=35):Promise<Outcome>{
 const outcome:Outcome={published:0,review:0,failed:0};
 // Replay legacy college announcements that were stamped "needs_review"
 // before automatic commitment publishing existed. A matching stage record
 // must still be UNCOMMITTED, with no selected college, and the original
 // submission must have a valid COMMIT field. This is universal for every
 // school, bounded by the existing cron limit, and performs no page-load work.
 //
 // The commitment_published audit marks recovered announcements so they
 // cannot be replayed if the player later changes colleges or decommits.
 const {rows}=await query<Tip>(`SELECT id::text,intake_source,matched_playerid,matched_hsid,raw_player_name,article_url,notes
 FROM news_tip_queue q WHERE q.status='new'
   AND q.intake_source IN ('correction','fan_drawer','manual_seed')
   AND (
     NOT EXISTS (
       SELECT 1 FROM fan_activity fa
       WHERE fa.action='contribute_processed'
         AND fa.details->>'queue_id'=q.id::text
     )
     OR (
       q.intake_source='correction'
       AND q.notes LIKE '%"committed_teamid"%'
       AND q.notes LIKE '%"status_label":"COMMIT"%'
       AND EXISTS (
         SELECT 1 FROM fan_activity fa
         WHERE fa.action='contribute_processed'
           AND fa.details->>'queue_id'=q.id::text
           AND fa.details->>'status'='needs_review'
       )
       AND NOT EXISTS (
         SELECT 1 FROM fan_activity fa
         WHERE fa.action='commitment_published'
           AND fa.details->>'queue_id'=q.id::text
       )
       AND EXISTS (
         SELECT 1 FROM flip_card_front_stage f
         WHERE f.playerid=q.matched_playerid
           AND f.hsid::text=q.matched_hsid
           AND UPPER(COALESCE(f.status_label,''))='UNCOMMITTED'
           AND f.committed_teamid IS NULL
           AND UPPER(COALESCE(NULLIF(TRIM(f.display_level_label),''),f.level_label,''))='HIGH SCHOOL'
       )
     )
   )
 ORDER BY q.submitted_at ASC LIMIT $1`,[limit]);
 for(const item of rows){
   try{
     const isCorrection=item.intake_source==='correction';
     const ok=isCorrection ? await processCorrection(item) : await processTip(item);
     if(ok){await markTip(item,'published','automatically processed');refreshSchoolAfterYearPublish(item);outcome.published++;}
     else{await markTip(item,'needs_review','Conflicting/unsupported field or unverified destination');outcome.review++;}
   } catch(e){console.error('[contribution-publisher] tip failed',{id:item.id,error:String(e)});outcome.failed++;}
 }
 // New player submissions need a match check and a dedicated stable YAT ID.
 // Creation happens through an atomic insert only when the full structured form is present.
 const missing=await query<Missing>(`SELECT id::text,hsid,player_name,grad_year,notes FROM missing_player_submission
 WHERE processed_status='new' ORDER BY created_at ASC LIMIT $1`,[limit]);
 for(const item of missing.rows){
   try{
     const details=parsed(item.notes);const fields=(details?.fields||{}) as Record<string,unknown>;
     const first=String(fields.first_name||'').trim(),last=String(fields.last_name||'').trim();
     if(!first||!last||!/^\d+$/.test(item.hsid)||!year(item.grad_year)) {
       await query("UPDATE missing_player_submission SET processed_status='needs_review',error_message='Incomplete identity or legacy submission' WHERE id=$1",[item.id]);outcome.review++;continue;
     }
     // A card from an earlier run of this submission keeps its player id.
     const earlier=await query<{playerid:string}>(`SELECT playerid FROM flip_card_front_stage WHERE source_summary->>'submission_id'=$1 LIMIT 1`,[item.id]);
     if(earlier.rows.length){
       await query("UPDATE missing_player_submission SET processed_status='published',published_playerid=$2,processed_at=now(),error_message=NULL WHERE id=$1 AND processed_status='new'",[item.id,earlier.rows[0].playerid]);
       outcome.published++;continue;
     }
     const dup=await query<{playerid:string}>(`SELECT playerid FROM flip_card_front_stage WHERE hsid=$1 AND lower(trim(first_name))=lower($2) AND lower(trim(last_name))=lower($3) LIMIT 2`,[item.hsid,first,last]);
     if(dup.rows.length){
       await query("UPDATE missing_player_submission SET processed_status='needs_review',error_message='Potential existing player; resolve identity first' WHERE id=$1",[item.id]);outcome.review++;continue;
     }
     const status=String(fields.status_label||'UNKNOWN').slice(0,40);
     const submittedTeamId=String(fields.current_teamid||'').trim();
     const canonicalTeam=submittedTeamId ? await resolveCanonicalCurrentTeam(submittedTeamId) : null;
     if (submittedTeamId && !canonicalTeam) {
       await query("UPDATE missing_player_submission SET processed_status='needs_review',error_message='Canonical team could not be verified' WHERE id=$1",[item.id]);
       outcome.review++;continue;
     }
     const level=canonicalTeam?.level || String(fields.level_label||'HIGH SCHOOL').slice(0,40);
     // A high school player's current team is his school's: C + hsid, when
     // the team list has it (never written to the list from here).
     const school=!canonicalTeam && level.toUpperCase()==='HIGH SCHOOL'
       ? (await query<{teamid:string;current_team_name:string|null;current_org_or_conference_name:string|null}>(
         `SELECT teamid, current_team_name, current_org_or_conference_name FROM teamid_universe_mapping WHERE teamid=$1 AND level_label='HIGH SCHOOL' LIMIT 1`,
         [highSchoolTeamId(item.hsid)])).rows[0]
       : undefined;
     const position=String(fields.position||'').slice(0,20)||null;
     const team=canonicalTeam?.name || school?.current_team_name || String(fields.current_team_name||'').slice(0,120)||null;
     const seq=await query<{n:string}>(`SELECT nextval('public.yat_playerid_seq')::text AS n`);
     const playerid=yatPlayerId(seq.rows[0].n);
     await query(`INSERT INTO flip_card_front_stage(playerid,hsid,first_name,last_name,display_name,class_of,position,status_label,level_label,current_team_name,current_teamid,current_org_or_conference_name,source_notes,source_summary)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULLIF($12,''),'fan-contributed; unverified',jsonb_build_object('submission_id',$13::text,'source','contribute'))`,
       [playerid,item.hsid,first,last,`${first} ${last}`,year(item.grad_year),position,status,level,team,
        canonicalTeam?.teamId||school?.teamid||null,canonicalTeam?.orgName||school?.current_org_or_conference_name||'',item.id]);
     await query("UPDATE missing_player_submission SET processed_status='published',published_playerid=$2,processed_at=now(),error_message=NULL WHERE id=$1 AND processed_status='new'",[item.id,playerid]);
     outcome.published++;
   }catch(e){console.error('[contribution-publisher] missing player failed',{id:item.id,error:String(e)});outcome.failed++;}
 }
 return outcome;
}
