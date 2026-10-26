import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { query } from '@/lib/tribune/db';
import type { TribuneEdition } from './types';

const PURPOSE = 'tribune-edition';
const YEAR = 366 * 86400;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const secret = () => {
  const value = process.env.TRIBUNE_PREFERENCES_SECRET || process.env.CRON_SECRET;
  if (!value) throw new Error('Edition signing secret unavailable');
  return value;
};
export function createTribuneEditionToken(id: string, now = Date.now()): string {
  if (!UUID.test(id)) throw new Error('Invalid edition');
  const data = Buffer.from(JSON.stringify({v:1,purpose:PURPOSE,id,exp:Math.floor(now/1000)+YEAR})).toString('base64url');
  return data+'.'+createHmac('sha256',secret()).update(PURPOSE+'.'+data).digest('base64url');
}
export function verifyTribuneEditionToken(token:string, now=Date.now()):string|null {
  try {
    if(token.length>1024)return null;
    const [data,signature,extra]=token.split('.');
    if(extra!==undefined||!data||!/^[A-Za-z0-9_-]{43}$/.test(signature||''))return null;
    const received=Buffer.from(signature,'base64url');
    const expected=createHmac('sha256',secret()).update(PURPOSE+'.'+data).digest();
    if(received.length!==expected.length||!timingSafeEqual(received,expected))return null;
    const p=JSON.parse(Buffer.from(data,'base64url').toString('utf8'));
    const seconds=Math.floor(now/1000);
    return p.v===1&&p.purpose===PURPOSE&&UUID.test(p.id)&&Number.isSafeInteger(p.exp)&&p.exp>seconds&&p.exp<=seconds+YEAR?p.id:null;
  }catch{return null;}
}

/** School news is shareable; a recipient's preferences and follow list are not. */
export function publicTribuneEdition(e:TribuneEdition, publicUrl:string):TribuneEdition {
  const copy=structuredClone(e);
  delete copy.follows;
  copy.recipientTier='fan';
  copy.links={
    hub:e.links.hub,tournament:e.links.tournament,share:publicUrl,web:publicUrl,
    text:publicUrl+'&format=text',officialRules:e.links.officialRules,sponsorInquiry:e.links.sponsorInquiry,
  };
  return copy;
}

export async function storeTribuneEdition(edition:TribuneEdition,firebaseUid:string):Promise<TribuneEdition> {
  if(edition.preview||edition.dataStatus!=='verified')throw new Error('Only verified delivery editions can be archived');
  const id=randomUUID();
  const base=new URL('/api/newsletter/edition',edition.links.hub);
  if(base.protocol!=='https:')throw new Error('Edition links require HTTPS');
  const publicUrl=base.toString()+'?public='+id;
  const token=createTribuneEditionToken(id);
  const privateUrl=base.toString()+'?token='+encodeURIComponent(token);
  const prepared=structuredClone(edition);
  prepared.links={...prepared.links,web:privateUrl,text:privateUrl+'&format=text',share:publicUrl};
  await query(`INSERT INTO tribune_private.alumni_newsletter_editions
    (id,firebase_uid,school_id,report_start,report_end,edition,public_edition)
    VALUES($1::uuid,$2,$3,$4::date,$5::date,$6::jsonb,$7::jsonb)`,
    [id,firebaseUid,edition.school.id,edition.period.start,edition.period.end,JSON.stringify(prepared),JSON.stringify(publicTribuneEdition(prepared,publicUrl))]);
  return prepared;
}

export async function readTribuneEdition(input:{token?:string|null;publicId?:string|null}):Promise<TribuneEdition|null> {
  const publicId=input.publicId;
  const id=publicId?(UUID.test(publicId)?publicId:null):verifyTribuneEditionToken(input.token||'');
  if(!id)return null;
  const column=publicId?'public_edition':'edition';
  return (await query<{value:TribuneEdition}>(`SELECT ${column} AS value FROM tribune_private.alumni_newsletter_editions WHERE id=$1::uuid`,[id])).rows[0]?.value||null;
}
