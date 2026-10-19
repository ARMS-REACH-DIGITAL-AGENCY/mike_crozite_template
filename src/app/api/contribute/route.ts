// src/app/api/contribute/route.ts
// Connect & Contribute: everything that isn't a photo.
//
//   POST { kind: 'data',    items: [{ kind, text }], season?, playerId?, playerName?, hsid?, source? }
//        { kind: 'tip',     url, why?, playerId?, playerName?, hsid? }
//        { kind: 'missing', name, hsid, gradYear?, position?, level?, team?, notes? }
//   (plus idToken?, pageUrl?)
//
// Corrections and tips wait in news_tip_queue, missing players in
// missing_player_submission. Nothing changes on the site until we've
// reviewed it.
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { DATA_KINDS, PLAYER_LEVELS } from '@/lib/contribute';
import { CONTRIBUTE_DAILY_LIMIT, contributionsToday, identifyContributor, logContribution } from '@/lib/contributeServer';
import { findOrCreateGhlContact, sendGHLEmail } from '@/lib/gohighlevel';

export const runtime = 'nodejs';

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
  if ((await contributionsToday(who.uid)) >= CONTRIBUTE_DAILY_LIMIT) {
    return fail("You've sent a lot today. Thank you! Please send the rest tomorrow.", 429);
  }

  const kind = text(body.kind, 20);
  const pageUrl = text(body.pageUrl) || null;
  let playerId = text(body.playerId, 20);
  let playerName = text(body.playerName, 120);
  let hsid = text(body.hsid, 20);

  try {
    // A player on the site: his name and school come from our records.
    if (playerId && kind !== 'missing') {
      const { rows } = await query<{ hsid: string | null; name: string }>(
        `SELECT hsid::text AS hsid, TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS name
           FROM flip_card_front_stage WHERE playerid::text = $1 LIMIT 1`,
        [playerId]
      );
      if (!rows[0]) playerId = '';
      else {
        playerName = rows[0].name || playerName;
        hsid = rows[0].hsid || hsid;
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
        'position','current_team_name','facebook','instagram','x','tiktok','linkedin'
      ] as const;
      const submitted:Record<string,string|string[]> = {};
      for (const key of allowed) {
        const value=raw[key];
        if (key === 'roster_years') {
          if (!Array.isArray(value)) continue;
          const years=[...new Set(value.map(v=>text(v,4)).filter(v=>/^\\d{4}$/.test(v) && +v>=1900 && +v<=new Date().getFullYear()+1))].slice(0,25);
          if (years.length) submitted[key]=years;
        } else if (typeof value === 'string' && value.trim()) {
          submitted[key]=text(value,key === 'current_team_name' ? 120 : 80);
        }
      }
      if (!Object.keys(submitted).length) return fail('Enter at least one player detail.');
      const allYears=Array.from({length:new Date().getFullYear()+2-1900},(_,i)=>String(1900+i));
      if (submitted.class_of && !allYears.includes(String(submitted.class_of))) return fail('Choose a valid graduation year.');
      if (submitted.status_label && ![
        'ACTIVE','RETIRED','INJURED 60-DAY','INJURED - FULL SEASON',
        'FREE AGENT','COACH','UNKNOWN'
      ].includes(String(submitted.status_label))) return fail('Choose a valid status.');
      if (submitted.level_label && ![
        'HIGH SCHOOL','NJCAA','CCCAA','NWAC','NCAA-D1','NCAA-D2','NCAA-D3','NAIA','ROOKIE','SINGLE-A','HIGH-A','DOUBLE-A','TRIPLE-A','MLB','INDY','INTERNATIONAL','RETIRED'
      ].includes(String(submitted.level_label))) return fail('Choose a valid level.');
      const isNew=!playerId;
      if (isNew) {
        const first=String(submitted.first_name||'').trim(),last=String(submitted.last_name||'').trim();
        if (!first||!last) return fail('Enter first and last names separately.');
        if (!/^\d+$/.test(hsid)) return fail('Select a high school.');
        playerName=[first,last].join(' ');
      } else if (!/^\d+$/.test(hsid)) return fail('Player school was not found.');
      const details={kind:isNew?'missing_player':'profile_update',playerId:playerId||null,hsid,fields:submitted,
        by:{uid:who.uid,name:who.name,email:who.email||null},submittedAt:new Date().toISOString()};
      if (isNew) {
        await query(
          `INSERT INTO missing_player_submission (hsid,player_name,grad_year,notes) VALUES ($1,$2,$3,$4)`,
          [hsid,playerName,submitted.class_of?Number(submitted.class_of):null,JSON.stringify(details)]
        );
      } else {
        await query(
          `INSERT INTO news_tip_queue (intake_source,sender_name,sender_contact_id,sender_role,raw_player_name,
                 matched_playerid,matched_hsid,article_url,notes,status)
           VALUES ('correction',$1,$2,$3,$4,$5,$6,$7,$8,'new')`,
          [who.name,who.uid,who.profile?.role||'fan',playerName||null,playerId,hsid,pageUrl||'',JSON.stringify(details)]
        );
      }
      await logContribution(who,'contribute_profile',{playerid:playerId||null,hsid,pageUrl,details});
      try {
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
      return NextResponse.json({ok:true,review:'pending'}, {status:201});
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
      if (!/^https?:\/\/\S+\.\S+/i.test(url)) return fail('Paste the link to the story.');
      await query(
        `INSERT INTO news_tip_queue (intake_source, sender_name, sender_contact_id, sender_role, raw_player_name,
                                     matched_playerid, matched_hsid, article_url, notes, status)
         VALUES ('fan_drawer', $1, $2, $3, $4, $5, $6, $7, $8, 'new')`,
        [who.name, who.uid, who.profile?.role || 'fan', playerName || null, playerId || null, hsid || null, url, why || null]
      );
      await logContribution(who, 'contribute_tip', { playerid: playerId || null, hsid: hsid || null, pageUrl, details: { url } });
      return NextResponse.json({ ok: true }, { status: 201 });
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
