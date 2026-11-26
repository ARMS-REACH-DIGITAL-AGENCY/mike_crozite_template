import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runFanProofs} from './rehearsal-fan-proofs';
import type {RenderedEdition} from '../../src/lib/newsletter/finishedPublication';
test('all recipients and both periods attempted even when one fan fails',async()=>{
 const out=mkdtempSync(join(tmpdir(),'fan-proofs-'));
 try{
 const seen:string[]=[];
 const rows=await runFanProofs([{email:'a@example.invalid',homeHsids:[1]},{email:'b@example.invalid',homeHsids:[2]}],[{cadence:'daily',date:'2026-04-12'},{cadence:'weekly',date:'2026-04-06'}],out,async(email,p,record)=>{
 seen.push(email+'/'+p.cadence);record(3,true,2);
 if(email.startsWith('a'))throw Error('fixture failure');
 return {html:'<p>proof</p>',text:'proof',facts:{recipient:{home_hsid:2,is_superfan:true},selection:{favorites:['YAT000001','YAT000002','YAT000003']}},hashes:{}} as unknown as RenderedEdition;
 },async()=>{});
 assert.equal(seen.length,4);assert.equal(rows.filter(x=>x.status==='failed').length,2);assert.equal(rows[0].reason,'fixture failure');assert.equal(rows[0].favoriteCount,3);
 assert.equal(rows[1].status,'built');assert.equal(readFileSync(join(out,encodeURIComponent('b@example.invalid'),'weekly.html'),'utf8'),'<p>proof</p>');
 }finally{rmSync(out,{recursive:true,force:true});}
});
