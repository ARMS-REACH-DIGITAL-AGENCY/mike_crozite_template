// Authenticated read-only bridge for QA. The normal production sender and this
// endpoint call the SAME SQL helper against the SAME live database.
import { timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { NextRequest, NextResponse } from 'next/server';
import { readNewsletterPreferences } from '@/lib/newsletter/finishedPublication';
import { readNewsletterRecipientDirectory } from '@/lib/newsletter/recipientDirectory';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store, max-age=0'}});
// Only known relations from the preferences read path may be disclosed.
// PostgreSQL 42501 does not always populate the structured table field.
const preferenceRelations=new Set([
  'newsletter_recipients','newsletter_favorites','user_scoreboard_schools',
  'user_profiles','user_favorites','alumni_newsletter_preferences',
  'alumni_newsletter_control','school_success',
]);
function deniedRelation(error:unknown):string|undefined {
  const pg=error as {code?:string;table?:string;message?:string}|null;
  if(pg?.code!=='42501') return undefined;
  const safe=(value:unknown):value is string=>typeof value==='string'&&preferenceRelations.has(value);
  if(safe(pg.table)) return pg.table;
  const relation=typeof pg.message==='string'
    ? /^permission denied for (?:table|view|relation) (?:public\.)?([a-z_][a-z0-9_]*)$/.exec(pg.message)?.[1]
    : undefined;
  return safe(relation)?relation:undefined;
}
export async function POST(request:NextRequest) {
  const token=process.env.REHEARSAL_LIVE_FAN_TOKEN;
  const given=request.headers.get('authorization') || '';
  const expected='Bearer '+(token || '');
  if(process.env.VERCEL_ENV!=='production' || !token || token.length<32
      || Buffer.byteLength(given)!==Buffer.byteLength(expected)
      || !timingSafeEqual(Buffer.from(given),Buffer.from(expected))) return reply({error:'unauthorized'},401);
  let input;
  try { input=await request.json(); } catch { return reply({error:'invalid request'},400); }
  const list=input?.action==='list-recipients';
  if(!input || (list ? Object.keys(input).some(k=>k!=='action') :
      typeof input.email!=='string' || !input.email.trim() || input.email.length>320
      || !['daily','weekly'].includes(input.cadence)
      || (input.firebaseUid!==undefined && (typeof input.firebaseUid!=='string' || !input.firebaseUid || input.firebaseUid.length>128)))) return reply({error:'invalid request'},400);
  const connection=process.env.PLAYERS_DATABASE_URL || process.env.DATABASE_URL;
  if(!connection) return reply({error:'production source unavailable'},503);
  // Verify the configured endpoint and the actual connected server. Use the
  // direct production host rather than the pooler's transaction/session GUCs.
  const url=new URL(connection);
  if(url.hostname.split('.')[0].replace(/-pooler$/,'')!=='ep-tiny-bird-a44r67gp')
    return reply({error:'wrong_production_endpoint'},503);
  url.hostname=url.hostname.replace(/^ep-tiny-bird-a44r67gp-pooler\./,'ep-tiny-bird-a44r67gp.');
  const pool=new Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:false},max:1,connectionTimeoutMillis:5000});
  try {
    const db=await pool.connect();
    try {
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const {rows:[identity]}=await db.query("SELECT current_setting('neon.endpoint_id',true) AS endpoint");
      if(identity?.endpoint!=='ep-tiny-bird-a44r67gp') throw new Error('Not the verified production database');
      const payload=list ? {recipients:await readNewsletterRecipientDirectory(db)} :
        {preferences:await readNewsletterPreferences(db,{email:input.email,cadence:input.cadence,firebaseUid:input.firebaseUid})};
      await db.query('COMMIT');
      return reply({source:'production-newsletter-preferences',...payload});
    } catch(error) {
      await db.query('ROLLBACK').catch(()=>{});
      // Only safe, fixed diagnostic codes leave the server. Never expose email,
      // SQL, connection information, raw error text or preferences in logs.
      const code=(error as {code?:string})?.code;
      const reason=error instanceof Error && error.message==='Not the verified production database' ? 'endpoint_identity_mismatch' :
        code==='42501' ? 'database_permission_denied' : code==='42P01' || code==='42703' ? 'database_schema_mismatch' :
        'recipient_preferences_unresolved';
      const table=deniedRelation(error);
      console.error('[rehearsal-newsletter-preferences]',reason,...(table?[table]:[]));
      return reply({error:reason,...(table?{table}:{})},409);
    } finally { db.release(); }
  } catch { return reply({error:'production source unavailable'},503); }
  finally { await pool.end(); }
}
