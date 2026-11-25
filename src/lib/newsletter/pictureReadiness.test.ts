import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEditionPictureVerifier, generatedPictureUrls, retryPicture, verifyNewsletterPng } from './pictureReadiness';
import { NEWSLETTER_ASSETS_BASE } from './newsletterImages';
const png=Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(10,16);png.writeUInt32BE(10,20);
const response=()=>new Response(png,{status:200,headers:{'content-type':'image/png'}});
test('only failed school editions are held, successful images shared and checked once',async()=>{
 const one=NEWSLETTER_ASSETS_BASE+'/digest/2026-04-07/5004.png',two=NEWSLETTER_ASSETS_BASE+'/digest/2026-04-07/12.png';
 const html=(url:string)=>'<img src="'+url+'">';
 let tries=0;
 const verify=createEditionPictureVerifier(new Set(['newsletter/digest/2026-04-07/5004.png']),async()=>{tries++;return response();});
 assert.deepEqual(await verify(html(one)),[one]);assert.deepEqual(await verify(html(two)),[]);assert.deepEqual(await verify(html(two)),[]);assert.equal(tries,1);
 assert.deepEqual(generatedPictureUrls(html(one)+html(one)+html('https://example.com/p.png')),[one]);
});
test('retry a failed picture and reject HTML or invalid PNG bytes even on HTTP 200',async()=>{
 let tries=0;await retryPicture(async()=>{if(++tries<3)throw Error('not ready');});assert.equal(tries,3);
 await assert.rejects(verifyNewsletterPng('https://example.com/image.png',async()=>new Response('not a PNG',{headers:{'content-type':'image/png'}})),/Invalid PNG/);
});
