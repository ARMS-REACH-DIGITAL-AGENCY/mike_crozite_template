// src/app/api/contribute/route.ts
// Connect & Contribute: everything that isn't a photo.
//
//   POST { kind: 'data',    items: [{ kind, text }], season?, playerId?, playerName?, hsid?, source? }
//        { kind: 'tip',     url, why?, playerId?, playerName?, hsid? }
//        { kind: 'missing', name, hsid, gradYear?, position?, level?, team?, notes? }
//   (plus idToken?, pageUrl?)
//
// Tips publish during the request after automatic screening. Corrections and
// missing players retain their own separate data-validation workflows.
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { query } from '@/lib/db';
import { registerPlayerInstagram } from '@/lib/playerInstagramRegistration';
import { scheduleNewInstagramImport } from '@/lib/scheduleNewInstagramImport';
import { publishAuthorizedPlayerInfo } from '@/lib/publishAuthorizedPlayerInfo';
import { normalizeSubmittedVarsityYears, publishQueuedVarsityYears, publishQueuedTipNow } from '@/lib/contributionPublisher';
import { DATA_KINDS, PLAYER_LEVELS } from '@/lib/contribute';
import { publishCollegeCommitment } from '@/lib/publishCollegeCommitment';
import { publishCurrentTeamChange, resolveCanonicalCurrentTeam } from '@/lib/publishCurrentTeamChange';
import { publishNewPlayerNow, NewPlayerPublicationError } from '@/lib/publishNewPlayer';
import { CONTRIBUTE_DAILY_LIMIT, contributionsToday, identifyContributor, isReviewer, canPublishFor, logContribution } from '@/lib/contributeServer';
import { findOrCreateGhlContact, sendGHLEmail } from '@/lib/gohighlevel';
import { parseNewsVideo, cleanNewsVideoTitle } from '@/lib/newsVideo';
import { fetchYouTubeVideoTitle } from '@/lib/youtubeVideoTitle';

export const runtime = 'nodejs';
export const maxDuration = 300;

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const text = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Nothing arrived. Please try again.');
  }

  const who = await identifyContributor(req, text(body.idToken, 4000));
  if (!who) return fail('Please sign in to send this.', 401);
  if ((await contributionsToday(who.uid)) >= CONTRIBUTE_DAILY_LIMIT &&
      !isReviewer(who) && !(who.publishingRoles || []).length) {
    return fail("You've sent a lot today. Thank you! Please send the rest tomorrow.", 429);
  }

  const kind = text(body.kind, 20);
  const pageUrl = text(body.pageUrl) || null;
  let playerId = text(body.playerId, 20);
  let playerName = text(body.playerName, 120);
  let hsid = text(body.hsid, 20);
  let selectedPlayerLevel = '';

  try {
    // A player on the site: his name and school come from our records.
    if (playerId && kind !== 'missing') {
      const { rows } = await query<{ hsid: string | null; name: string; player_level: string | null }>(
        `SELECT hsid::text AS hsid, TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS name,
             COALESCE(NULLIF(TRIM(display_level_label),''),level_label) AS player_level
           FROM flip_card_front_stage WHERE playerid::text = $1 LIMIT 1`,
        [playerId]
      );
      if (!rows[0]) playerId = '';
      else {
        playerName = rows[0].name || playerName;
        hsid = rows[0].hsid || hsid;
        selectedPlayerLevel = String(rows[0].player_level || '').trim().toUpperCase();
      }
    }

    if (kind === 'profile') {
      // Always queue fan-provided identity changes for review; updating
      // authoritative stage rows on an anonymous claim would allow vandalism.
      // The form preloads from flip_card_front_stage, and fan-submitted
      // additions are logged with exact field names for an auditable merge.
      const raw = body.fields && typeof body.fields === 'object' && !Array.isArray(body.fields)
        ? body.fields as Record<string,unknown> : {};
      const allowed = [
        'first_name','last_name','class_of','roster_years','status_label','level_label',
        'position','current_team_name','current_teamid','committed_teamid','facebook','instagram','x','tiktok','linkedin'
      ] as const;
      const submitted:Record<string,string|string[]> = {};
      for (const key of allowed) {
        // Existing-player corrections submit only edited fields. An omitted
        // college commitment is not an invalid college or a request to clear it.
        if (!Object.prototype.hasOwnProperty.call(raw,key)) continue;
        const value=raw[key];
        if (key === 'roster_years') {
          if (!Array.isArray(value)) continue;
          const years=normalizeSubmittedVarsityYears(value);
          if (!years) return fail('Choose valid high-school varsity years.');
          submitted[key]=years;
         } else if (key === 'current_teamid') {
          // A missing player may legitimately have no known current team.
          // Only submitted, non-empty identities require a search selection.
          if (value === '' || value === null || value === undefined) continue;
          if (typeof value !== 'string' || !/^\d{1,18}$/.test(value.trim())) {
            return fail('Choose a current team from Global Search.');
          }
          submitted.current_teamid=value.trim();
        } else if (key === 'committed_teamid') {
          // An explicit blank clears an earlier commitment; absence does not.
          if (typeof value !== 'string') return fail('Choose a valid college.');
          submitted[key]=text(value, 20);
        } else if (typeof value === 'string' && value.trim()) {
          submitted[key]=text(value,key === 'current_team_name' ? 120 : 80);
        }
      }
      if (!Object.keys(submitted).length) return fail('Enter at least one player detail.');
      if (submitted.current_team_name && !submitted.current_teamid) {
        return fail('Choose the current team from Global Search, not a typed name.');
      }
      const selectedCurrentTeam=typeof submitted.current_teamid==='string'
        ? await resolveCanonicalCurrentTeam(submitted.current_teamid) : null;
      if (submitted.current_teamid && !selectedCurrentTeam) {
        return fail('The selected team could not be verified. Search and select it again.');
      }
      if (selectedCurrentTeam) {
        // Canonical team ID dictates display name, level and conference.
        submitted.current_team_name=selectedCurrentTeam.name;
        submitted.level_label=selectedCurrentTeam.level;
      }
      const allYears=Array.from({length:new Date().getFullYear()+2-1900},(_,i)=>String(1900+i));
      if (submitted.class_of && !allYears.includes(String(submitted.class_of))) return fail('Choose a valid graduation year.');
      const isNew=!playerId;
      const isHighSchool = isNew
        ? String(submitted.level_label || '').trim().toUpperCase() === 'HIGH SCHOOL'
        : selectedPlayerLevel === 'HIGH SCHOOL';
      const status = String(submitted.status_label || '').toUpperCase();
      // An existing high-school player can graduate into a real college/pro
      // roster when a verified current-team selection sets the status ACTIVE.
      // A COLLEGE COMMIT remains separate and must not move the playing level.
      const nextLevelTransition=!isNew && isHighSchool && !!selectedCurrentTeam && status==='ACTIVE';
      // A blank optional commitment field is not a commitment request when
      // creating a missing player; preserve the existing new-player workflow.
      if (isNew && submitted.committed_teamid === '' && status !== 'COMMIT') {
        delete submitted.committed_teamid;
      }
      const teamIdSpecified = Object.prototype.hasOwnProperty.call(submitted,'committed_teamid');
      const teamId = String(submitted.committed_teamid || '');
      if (submitted.status_label && !(isHighSchool && !nextLevelTransition
        ? ['UNCOMMITTED','COMMIT'].includes(status)
        : ['ACTIVE','RETIRED','INJURED 60-DAY','INJURED - FULL SEASON','FREE AGENT','COACH','UNKNOWN'].includes(status))) {
        return fail(isHighSchool ? 'High school players must be UNCOMMITTED or COMMIT.' : 'Choose a valid status.');
      }
      if (teamIdSpecified || status==='COMMIT' || status==='UNCOMMITTED') {
        if (isNew && isHighSchool && status==='UNCOMMITTED' && !teamIdSpecified) {
          // A missing high-school player may be added as UNCOMMITTED.
        } else {
        if (!isHighSchool || isNew) return fail('Select an existing high-school player to announce a college commitment.');
        if (!teamIdSpecified || !['UNCOMMITTED','COMMIT'].includes(status)) {
          return fail('Choose the high-school status and college together.');
        }
        if (status==='UNCOMMITTED') {
          if (teamId) return fail('UNCOMMITTED players cannot have a committed college.');
        } else {
          if (!/^\d{1,18}$/.test(teamId)) return fail('Choose a college from Global Search.');
        }
        }
      }
      if (submitted.level_label && ![
        'HIGH SCHOOL','NJCAA','CCCAA','NWAC','NCAA-D1','NCAA-D2','NCAA-D3','NAIA','ROOKIE','SINGLE-A','HIGH-A','DOUBLE-A','TRIPLE-A','MLB','INDY','INTERNATIONAL','RETIRED'
      ].includes(String(submitted.level_label))) return fail('Choose a valid level.');
      if (isNew) {
        const first=String(submitted.first_name||'').trim(),last=String(submitted.last_name||'').trim();
        if (!first||!last) return fail('Enter first and last names separately.');
        if (!/^\d+$/.test(hsid)) return fail('Select a high school.');
        playerName=[first,last].join(' ');
      } else if (!/^\d+$/.test(hsid)) return fail('Player school was not found.');
      if (isNew) {
        // Preview deployments share the production DB: never create a live
        // player from a preview test.
        if (process.env.VERCEL_ENV === 'preview') {
          return NextResponse.json({ok:true,review:'preview_only'}, {status:200});
        }
        try {
          const created=await publishNewPlayerNow({
            hsid,fields:submitted,canonicalTeam:selectedCurrentTeam,
          });
          // The same Instagram registration workflow applies to newly created
          // player IDs. A non-professional account still receives its profile link;
          // Meta eligibility is resolved asynchronously by the existing sync.
          const instagramState = typeof submitted.instagram === 'string'
            ? await registerPlayerInstagram(created.playerId, hsid, submitted.instagram)
            : 'queued';
          if (instagramState === 'registered') scheduleNewInstagramImport(created.playerId, String(submitted.instagram));
          await logContribution(who,'contribute_profile',{
            playerid:created.playerId,hsid,pageUrl,
            details:{kind:'missing_player',fields:submitted,autoPublished:true,
              submissionId:created.submissionId,instagram:instagramState},
          }).catch(error=>console.error('[contribute/new-player] activity log failed',error));
          return NextResponse.json({
            ok:true,review:'published_player',playerId:created.playerId,
            hsid,submissionId:created.submissionId,instagram:instagramState,
          },{status:201});
        } catch (error) {
          if (error instanceof NewPlayerPublicationError) return fail(error.message,error.status);
          throw error;
        }
      }
      const hasCommitmentUpdate = !isNew && isHighSchool && teamIdSpecified
        && ['COMMIT','UNCOMMITTED'].includes(status);
      let savedCommitment: {teamName:string|null;changed:boolean}|null=null;
      if (hasCommitmentUpdate) {
        // Previews share the production database. Test the form without
        // writing ANY commitment, even when other fields changed.
        if (process.env.VERCEL_ENV === 'preview') {
          return NextResponse.json({ok:true,review:'preview_only'}, {status:200});
        }
        // Publish the canonical college selection immediately: this is
        // distinct from the review workflow for unrelated profile edits.
        savedCommitment=await publishCollegeCommitment({
          playerId,hsid,status:status as 'COMMIT'|'UNCOMMITTED',teamId,
          contributorUid:who.uid,source:'contribute',
        });
        // Do not leave an already-published college commitment in the
        // correction queue. Other edited fields retain their review rules.
        delete submitted.status_label;
        delete submitted.committed_teamid;
        if (Object.keys(submitted).length===0) {
          await logContribution(who,'contribute_profile',{
            playerid:playerId,hsid,pageUrl,details:{status_label:status,
              committed_teamid:teamId,teamName:savedCommitment.teamName,
              autoPublished:true},
          });
          return NextResponse.json({ok:true,review:'published_commitment',
            commitment:{status,teamId,teamName:savedCommitment.teamName}}, {status:201});
        }
      }
      // Authorized publishers are identified by their verified Firebase UID and
      // scoped user_roles grant. Their edits do not enter the fan approval queue.
      // Reject noncanonical team/status combinations rather than silently
      // publishing contradictory roster data.
      const statusOnlySubmission = typeof submitted.status_label === 'string' &&
        Object.keys(submitted).every(key => key === 'status_label' || key === 'level_label');
      if (!isNew && process.env.VERCEL_ENV !== 'preview' &&
          canPublishFor(who, hsid, playerId) && !statusOnlySubmission) {
        const profile = { ...submitted };
        if (selectedCurrentTeam) {
          if (status && status !== 'ACTIVE') {
            return fail('Changing a current team requires an ACTIVE playing status.', 409);
          }
          const saved = await publishCurrentTeamChange({
            playerId, hsid, team: selectedCurrentTeam, reviewerUid: who.uid,
          });
          if (!saved) return fail('Current team update failed. No other fields were changed.', 409);
          for (const key of ['current_teamid','current_team_name','level_label','status_label']) delete profile[key];
        } else if (profile.status_label || profile.level_label || profile.committed_teamid !== undefined) {
          // Commitment/status edits have dedicated canonical procedures and
          // cannot be combined with unrelated fields through a raw stage write.
          return fail('Publish the playing-status or college-commitment change separately from other fields.', 409);
        }

        try {
          const ok = await publishAuthorizedPlayerInfo({
            playerId, hsid, uid: who.uid, fields: profile,
          });
          if (!ok) return fail('Player record changed. Reload the profile and try again.', 409);
        } catch (error) {
          return fail(error instanceof Error ? error.message : 'Player information was not saved.', 400);
        }

        const instagramState = typeof profile.instagram === 'string'
          ? await registerPlayerInstagram(playerId, hsid, profile.instagram) : 'queued';
        if (instagramState === 'registered') scheduleNewInstagramImport(playerId, String(profile.instagram));
        if (typeof profile.x === 'string') {
          const xHandle = String(profile.x).trim().replace(/^@/, '')
            .replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i, '').replace(/[/?#].*$/, '');
          if (/^[a-zA-Z0-9_]{1,15}$/.test(xHandle)) {
            await query(
              "INSERT INTO social_sources(platform,handle,owner_type,hsid,playerid,authorization_type,status) " +
              "SELECT 'x',$1,'player',$2,$3,'publisher','active' " +
              "WHERE NOT EXISTS (SELECT 1 FROM social_sources WHERE platform='x' AND lower(handle)=lower($1)) " +
              "ON CONFLICT(platform,handle) DO NOTHING",
              [xHandle,hsid,playerId],
            );
          }
        }
        revalidateTag('school-data:' + hsid, { expire: 0 });
        await logContribution(who,'contribute_profile',{
          playerid:playerId,hsid,pageUrl,
          details:{autoPublished:true,source:'verified_publisher',fields:submitted,
            instagram:instagramState},
        });
        return NextResponse.json({ok:true,review:'published_profile',
          instagram:instagramState}, {status:201});
      }

      // Owner/reviewer emails are configured as production environment settings.
      // Site-authorized reviewer submissions publish current affiliations directly.
      // Ordinary fan edits remain queued; a public form must not overwrite player truth.
      // One reusable rule applies to all players and schools, not a school-specific exception.
      const directTeamFields=['status_label','level_label','current_team_name','current_teamid'];
      const directTeamUpdate=!isNew && isReviewer(who) && process.env.VERCEL_ENV !== 'preview'
        && status==='ACTIVE' && !!selectedCurrentTeam
        && Object.keys(submitted).every(k=>directTeamFields.includes(k));
      if (directTeamUpdate && selectedCurrentTeam) {
        const saved=await publishCurrentTeamChange({
          playerId,hsid,team:selectedCurrentTeam,reviewerUid:who.uid,
        });
        if (!saved) return fail('Player team could not be updated.',409);
        await logContribution(who,'contribute_profile',{
          playerid:playerId,hsid,pageUrl,
          details:{autoPublished:true,fields:{
            status_label:'ACTIVE',level_label:selectedCurrentTeam.level,
            current_team_name:selectedCurrentTeam.name,
            current_teamid:selectedCurrentTeam.teamId,
            current_org_or_conference_name:selectedCurrentTeam.orgName,
          }},
        });
        return NextResponse.json({ok:true,review:'published_team'}, {status:201});
      }

      // A verified YAT?STATS reviewer can publish an explicit status-only (or
      // status + level) correction immediately. Do NOT grant that privilege to
      // ordinary fans. Team/identity/commitment changes retain their own
      // canonical verification or review workflows.
      //
      // Use the displayed form baseline as a compare-and-set guard so a
      // stale browser tab cannot silently replace a newer MLB/college update.
      const statusOnlyFields=['status_label','level_label'];
      const directStatusUpdate=!isNew && isReviewer(who) && process.env.VERCEL_ENV !== 'preview'
        && typeof submitted.status_label==='string'
        && Object.keys(submitted).every(k=>statusOnlyFields.includes(k))
        && Object.keys(submitted).length>0;
      if (directStatusUpdate) {
        const baseline=body.expectedProfile && typeof body.expectedProfile==='object'
          && !Array.isArray(body.expectedProfile)
          ? body.expectedProfile as Record<string,unknown> : null;
        if (!baseline || typeof baseline.status_label!=='string' || typeof baseline.level_label!=='string') {
          return fail('Reload the player before applying an immediate correction.',409);
        }
        const nextStatus=String(submitted.status_label);
        const nextLevel=typeof submitted.level_label==='string' ? submitted.level_label : null;
        // Retiring/freeing a player who still has a current affiliation needs a
        // separate team transition, not a contradictory badge-only change.
        // An ACTIVE status with an existing canonical team may not replace its
        // playing level with an unrelated team level.
        const result=await query<{playerid:string}>(`
          WITH updated AS (
            UPDATE flip_card_front_stage f SET
              status_label=$3,display_status_label=$3,
              team_affiliation_status=CASE
                WHEN $3::text='RETIRED' THEN 'RETIRED'
                WHEN $3::text='FREE AGENT' THEN 'FREE AGENT'
                WHEN $3::text='ACTIVE' AND COALESCE(f.team_affiliation_status,'') ILIKE 'RETIRED%' THEN NULL
                ELSE f.team_affiliation_status END,
              level_label=COALESCE($4::text,f.level_label),
              display_level_label=COALESCE($4::text,f.display_level_label),
              source_summary=COALESCE(f.source_summary,'{}'::jsonb) ||
                jsonb_build_object('reviewer_profile_update',jsonb_build_object(
                  'status_label',$3::text,'level_label',COALESCE($4::text,f.level_label),
                  'actor_uid',$7::text,'updated_at',now())),
              updated_at=now(),stage_updated_at=now()
            WHERE f.playerid::text=$1 AND f.hsid::text=$2
              AND COALESCE(NULLIF(BTRIM(f.display_status_label),''),f.status_label,'')=$5
              AND COALESCE(NULLIF(BTRIM(f.display_level_label),''),f.level_label,'')=$6
              AND ($3::text NOT IN ('RETIRED','FREE AGENT')
                   OR (f.current_teamid IS NULL AND NULLIF(BTRIM(COALESCE(f.current_team_name,'')),'') IS NULL))
              AND ($3::text<>'ACTIVE' OR COALESCE(f.team_affiliation_status,'')<>'RETIRED')
              AND ($4::text IS NULL OR $3::text<>'ACTIVE' OR f.current_teamid IS NULL
                   OR EXISTS (SELECT 1 FROM teamid_universe_mapping u
                      WHERE u.teamid=f.current_teamid AND u.level_label=$4))
            RETURNING f.playerid::text AS playerid,f.hsid::text AS hsid
          ), audited AS (
            INSERT INTO fan_activity(firebase_uid,action,playerid,hsid,details)
              SELECT $7,'contribute_published',playerid,hsid,
                jsonb_build_object('source','reviewer_profile_status','status_label',$3::text,
                  'level_label',$4::text,'previous_status',$5::text,'previous_level',$6::text)
              FROM updated RETURNING id
          )
          SELECT playerid FROM updated
        `,[playerId,hsid,nextStatus,nextLevel,baseline.status_label,baseline.level_label,who.uid]);
        if (result.rows.length!==1) {
          return fail('Player record changed or the requested status conflicts with current affiliation. Reload and review before trying again.',409);
        }
        revalidateTag('school-data:' + hsid,{expire:0});
        await logContribution(who,'contribute_profile',{
          playerid:playerId,hsid,pageUrl,
          details:{autoPublished:true,fields:submitted,source:'reviewer_profile_status'},
        });
        return NextResponse.json({ok:true,review:'published_profile'}, {status:201});
      }

      const details={kind:isNew?'missing_player':'profile_update',playerId:playerId||null,hsid,fields:submitted,
        by:{uid:who.uid,name:who.name,email:who.email||null},submittedAt:new Date().toISOString()};
      let contributionQueueId: string | null = null;
      {
        const queued=await query<{id:string}>(
          `INSERT INTO news_tip_queue (intake_source,sender_name,sender_contact_id,sender_role,raw_player_name,
                 matched_playerid,matched_hsid,article_url,notes,status)
           VALUES ('correction',$1,$2,$3,$4,$5,$6,$7,$8,'new') RETURNING id::text`,
          [who.name,who.uid,who.profile?.role||'fan',playerName||null,playerId,hsid,pageUrl||'',JSON.stringify(details)]
        );
        contributionQueueId=queued.rows[0]?.id||null;
      }
      // Keep fan correction review rules independent from the social link.
      // Shared registration enforces ownership and correctly queues professional
      // eligibility checks; do not infer eligibility from Instagram verification.
      // Ordinary fan corrections continue through their established verification
      // workflow. Only authenticated publishers may immediately claim a public
      // handle and start a Meta check; otherwise anyone could attach another
      // person's Instagram account to a player without authorization.
      const instagramState = 'queued' as const;
      const varsityOnly=!isNew && Object.keys(submitted).length===1 && Array.isArray(submitted.roster_years);
      const varsityPublication=varsityOnly && contributionQueueId
        ? await publishQueuedVarsityYears(contributionQueueId)
        : 'pending';
      await logContribution(who,'contribute_profile',{playerid:playerId||null,hsid,pageUrl,details});
      if (process.env.VERCEL_ENV !== 'preview') try {
        const notify='newdata@yatstats.com';
        const contact=await findOrCreateGhlContact(notify,'YATSTATS Data Review');
        if(contact){
          const esc=(s:string)=>s.replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]||k));
          await sendGHLEmail(contact,'New YAT?STATS player information: '+playerName,
            '<p>A fan submitted '+(isNew?'a missing player':'player corrections')+' for review.</p>'+
            '<p><b>Player:</b> '+esc(playerName)+'<br/><b>School:</b> '+esc(hsid)+
            '<br/><b>Sender:</b> '+esc(who.email||who.name)+'</p><pre>'+esc(JSON.stringify(submitted,null,2))+'</pre>');
        }
      } catch(error) { console.error('[contribute/profile] owner notification failed',error); }
      return NextResponse.json({ok:true,review:savedCommitment?'published_commitment':varsityPublication,
        otherFieldsQueued:Boolean(savedCommitment),instagram:instagramState,
        commitment:savedCommitment?{status,teamId,teamName:savedCommitment.teamName}:undefined}, {status:201});
    }

    if (kind === 'data') {
      // One row in the queue per checked item, each labelled with what it
      // is and the season it's about.
      const raw = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
      const items = raw
        .map((it) => ({ kind: DATA_KINDS.find((k) => k.id === text(it?.kind, 20)), text: text(it?.text, 5000) }))
        .filter((it): it is { kind: (typeof DATA_KINDS)[number]; text: string } => Boolean(it.kind && it.text))
        .slice(0, 10);
      const source = text(body.source);
      const season = (body.season || null) as { year?: unknown; team?: unknown; label?: unknown } | null;
      const seasonTag = season?.year ? ` ${text(season.year, 4)} ${text(season.team, 120)}${season.label ? ` (${text(season.label, 40)})` : ''}` : '';
      if (!items.length) return fail('Check what you have and fill it in.');
      if (source && !/^https?:\/\//i.test(source)) return fail('The link should start with http:// or https://');
      for (const it of items) {
        await query(
          `INSERT INTO news_tip_queue (intake_source, sender_name, sender_contact_id, sender_role, raw_player_name,
                                       matched_playerid, matched_hsid, article_url, notes, status)
           VALUES ('correction', $1, $2, $3, $4, $5, $6, $7, $8, 'new')`,
          [who.name, who.uid, who.profile?.role || 'fan', playerName || null, playerId || null, hsid || null, source || pageUrl || '', `[${it.kind.id}${seasonTag}] ${it.text}`]
        );
      }
      await logContribution(who, 'contribute_data', { playerid: playerId || null, hsid: hsid || null, pageUrl, details: { kinds: items.map((i) => i.kind.id), season: seasonTag.trim() || null } });
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    if (kind === 'tip') {
      const url = text(body.url);
      const why = text(body.why, 2000);
      const enteredTitle = cleanNewsVideoTitle(text(body.title, 2000));
       if (!/^https?:\/\/\S+\.\S+/i.test(url)) return fail('Paste the news, video, or social link.');
       const provider = parseNewsVideo(url);
       const isClip = Boolean(provider);
       const youtubeFallback = !enteredTitle && provider?.provider === 'YouTube';
       const title = enteredTitle || (youtubeFallback ? await fetchYouTubeVideoTitle(url) : null) || '';
       if (!title) return fail(youtubeFallback
         ? 'Could not retrieve the YouTube title. Enter your own title to submit.'
         : 'Please enter a title.');
       // Preserve contributor headline first; store YouTube title only as fallback.
       const notes = JSON.stringify({ kind: isClip ? 'clip' : 'news', title, why, titleSource: enteredTitle ? 'fan' : 'youtube_oembed' });
      const queued=await query<{id:string}>(
        `INSERT INTO news_tip_queue (intake_source, sender_name, sender_contact_id, sender_role, raw_player_name,
                                     matched_playerid, matched_hsid, article_url, notes, status)
         VALUES ('fan_drawer', $1, $2, $3, $4, $5, $6, $7, $8, 'new') RETURNING id::text`,
        [who.name, who.uid, who.profile?.role || 'fan', playerName || null, playerId || null, hsid || null, url, notes]
      );
      await logContribution(who, 'contribute_tip', { playerid: playerId || null, hsid: hsid || null, pageUrl, details: { url, sourceType: isClip ? 'clip' : 'news' } });
      // Preview deployments share the production DB; never let a preview
      // contribution test publish a real news article.
      const publication=process.env.VERCEL_ENV==='preview'?'pending'
        :await publishQueuedTipNow(queued.rows[0].id);
      if(publication==='rejected')return NextResponse.json({ok:false,error:'The contribution did not pass the automatic publishing checks.'},{status:422});
      return NextResponse.json({ok:true,publication}, {status:201});
    }

    if (kind === 'missing') {
      const name = text(body.name, 120);
      const gradYear = Number(text(body.gradYear, 4));
      const level = text(body.level, 40);
      if (!name) return fail("Type the player's name.");
      if (!/^\d+$/.test(hsid)) return fail('Pick his high school.');
      if (gradYear && (gradYear < 1900 || gradYear > new Date().getFullYear() + 4)) return fail('Check the graduation year.');
      const notes = [
        level && PLAYER_LEVELS.includes(level) ? `Level: ${level}` : '',
        text(body.position, 40) ? `Position: ${text(body.position, 40)}` : '',
        text(body.team, 120) ? `Team: ${text(body.team, 120)}` : '',
        text(body.notes, 3000),
        `Sent by ${who.name}${who.email ? ` <${who.email}>` : ''} (${who.uid})`,
      ].filter(Boolean).join(' | ');
      await query(
        `INSERT INTO missing_player_submission (hsid, player_name, grad_year, notes) VALUES ($1, $2, $3, $4)`,
        [hsid, name, gradYear || null, notes]
      );
      await logContribution(who, 'contribute_missing', { hsid, pageUrl, details: { name, gradYear: gradYear || null } });
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    return fail('Unknown request.');
  } catch (error) {
    console.error('[contribute] failed', error);
    return fail('That could not be sent. Please try again.', 500);
  }
}
