// Authenticated read-only bridge for QA. The normal production sender and this
// endpoint call the SAME SQL helper against the SAME live database.
import { timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { NextRequest, NextResponse } from 'next/server';
import { readNewsletterPreferences } from '@/lib/newsletter/finishedPublication';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store, max-age=0'}});
export async function POST(request:NextRequest) {
  const token=process.env.REHEARSAL_LIVE_FAN_TOKEN;
  const given=request.headers.get('authorization') || '';
  const expected='Bearer '+(token || '');
  if(process.env.VERCEL_ENV!=='production' || !token || token.length<32
      || Buffer.byteLength(given)!==Buffer.byteLength(expected)
      || !timingSafeEqual(Buffer.from(given),Buffer.from(expected))) return reply({error:'unauthorized'},401);
  let input;
  try { input=await request.json(); } catch { return reply({error:'invalid request'},400); }
  if(!input || typeof input.email!=='string' || !input.email.trim() || input.email.length>320
      || !['daily','weekly'].includes(input.cadence)
      || (input.firebaseUid!==undefined && (typeof input.firebaseUid!=='string' || !input.firebaseUid || input.firebaseUid.length>128))) return reply({error:'invalid request'},400);
  const connection=process.env.PLAYERS_DATABASE_URL || process.env.DATABASE_URL;
  if(!connection) return reply({error:'production source unavailable'},503);
  const pool=new Pool({connectionString:connection,ssl:{rejectUnauthorized:false},max:1,connectionTimeoutMillis:5000});
  try {
    const db=await pool.connect();
    try {
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const {rows:[identity]}=await db.query("SELECT current_setting('neon.endpoint_id',true) AS endpoint");
      if(identity?.endpoint!=='ep-tiny-bird-a44r67gp') throw new Error('Not the verified production database');
      const preferences=await readNewsletterPreferences(db,{email:input.email,cadence:input.cadence,firebaseUid:input.firebaseUid});
      await db.query('COMMIT');
      return reply({source:'production-newsletter-preferences',preferences});
    } catch {
      await db.query('ROLLBACK').catch(()=>{});
      return reply({error:'live preferences could not be resolved'},409);
    } finally { db.release(); }
  } catch { return reply({error:'production source unavailable'},503); }
  finally { await pool.end(); }
}
