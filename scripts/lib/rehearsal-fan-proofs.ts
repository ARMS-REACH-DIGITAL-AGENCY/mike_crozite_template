import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import type {RenderedEdition,Cadence} from '../../src/lib/newsletter/finishedPublication';
type Period={cadence:Cadence;date:string};
type Entry={email:string;homeHsids:number[]};
type Summary={email:string;cadence:Cadence;date:string;favoriteCount:number|null;membership:string|null;homeHsid:number|null;status:'built'|'failed';reason?:string};
export async function runFanProofs(directory:Entry[],periods:Period[],out:string,render:(email:string,period:Period,onPreferences:(count:number,superfan:boolean,hsid:number)=>void)=>Promise<RenderedEdition>,verify=verifyPictures):Promise<Summary[]>{
 mkdirSync(out,{recursive:true,mode:0o700});
 const results:Summary[]=[];
 const imageChecks=new Map<string,Promise<void>>();
 for(const period of periods)for(const {email} of directory){
  const row:Summary={email,cadence:period.cadence,date:period.date,favoriteCount:null,membership:null,homeHsid:null,status:'failed'};
  try {
   const edition=await render(email,period,(count,superfan,hsid)=>{row.favoriteCount=count;row.membership=superfan?'SuperFan':'Fan';row.homeHsid=hsid;});
   row.favoriteCount=edition.facts.selection.favorites.length;row.membership=edition.facts.recipient.is_superfan?'SuperFan':'Fan';row.homeHsid=Number(edition.facts.recipient.home_hsid);
   const folder=join(out,encodeURIComponent(email));mkdirSync(folder,{recursive:true,mode:0o700});
   writeFileSync(join(folder,period.cadence+'.html'),edition.html,{mode:0o600});
   writeFileSync(join(folder,period.cadence+'.txt'),edition.text,{mode:0o600});
   writeFileSync(join(folder,period.cadence+'-manifest.json'),JSON.stringify({favoriteCount:row.favoriteCount,membership:row.membership,homeHsid:row.homeHsid,hashes:edition.hashes,source:'live production preferences',period},null,2),{mode:0o600});
   await verify(edition.html,imageChecks);
   row.status='built';
  }catch(error){row.reason=(error instanceof Error?error.message:String(error)).replace(/postgres(?:ql)?:\/\/\S+/gi,'[redacted database URL]');}
  results.push(row);
  writeFileSync(join(out,'summary.json'),JSON.stringify(results,null,2),{mode:0o600});
 }
 // Even an empty directory has a summary.
 writeFileSync(join(out,'summary.json'),JSON.stringify(results,null,2),{mode:0o600});
 const csv=(x:unknown)=>'"'+String(x??'').replace(/"/g,'""')+'"';
 const cols=['email','cadence','date','favoriteCount','membership','homeHsid','status','reason'] as const;
 writeFileSync(join(out,'summary.csv'),[cols.join(','),...results.map(r=>cols.map(k=>csv(r[k])).join(','))].join('\n')+'\n',{mode:0o600});
 return results;
}
async function verifyPictures(html:string,cache:Map<string,Promise<void>>){
 const urls=[...new Set([...html.matchAll(/<img\b[^>]*\bsrc="(https:\/\/[^"]+)"/gi)].map(m=>m[1].replace(/&amp;/g,'&')))];
 for(const url of urls){
  if(!cache.has(url))cache.set(url,(async()=>{
   for(let i=0;i<3;i++){
    try{const response=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'follow'});const ok=response.status===200&&String(response.headers.get('content-type')).startsWith('image/');await response.body?.cancel();if(ok)return;}catch{}
   }
   throw Error('Required image unavailable: '+new URL(url).pathname);
  })());
  await cache.get(url);
 }
}
