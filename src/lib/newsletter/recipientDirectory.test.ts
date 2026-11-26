import assert from 'node:assert/strict';
import {test} from 'node:test';
import {normalizeNewsletterRecipients,readNewsletterRecipientDirectory} from './recipientDirectory';
import {readLiveNewsletterDirectory} from './liveNewsletterPreferences';
test('one directory for cron and rehearsal, normalized and deduplicated, missing schools retained',async()=>{
 const rows=[{email:' A@EXAMPLE.invalid ',home_hsid:'5004'},{email:'a@example.invalid',home_hsid:1450},{email:'a@example.invalid',home_hsid:5004},{email:'b@example.invalid',home_hsid:null},{email:' ',home_hsid:2}];
 const expected=[{email:'a@example.invalid',homeHsids:[1450,5004]},{email:'b@example.invalid',homeHsids:[]}];
 assert.deepEqual(normalizeNewsletterRecipients(rows),expected);
 assert.deepEqual(await readNewsletterRecipientDirectory({query:async(sql)=>{assert.match(sql,/FROM public.newsletter_recipients/);return {rows};}}),expected);
 const client=async(_url:unknown,init?:RequestInit)=>{assert.equal(JSON.parse(String(init?.body)).action,'list-recipients');return Response.json({source:'production-newsletter-preferences',recipients:expected});};
 assert.deepEqual(await readLiveNewsletterDirectory('test-only-not-a-real-token-123456789',client),expected);
 await assert.rejects(readLiveNewsletterDirectory('test-only-not-a-real-token-123456789',async()=>Response.json({error:'endpoint_identity_mismatch'},{status:409})),/endpoint_identity_mismatch/);
 await assert.rejects(readLiveNewsletterDirectory('test-only-not-a-real-token-123456789',async()=>Response.json({source:'production-newsletter-preferences',recipients:[expected[0],expected[0]]})),/Invalid live recipient directory/);
});
