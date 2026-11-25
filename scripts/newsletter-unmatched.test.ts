import assert from 'node:assert/strict';
import { test } from 'node:test';
import { partitionPublicationSource, type CanonicalPublicationLine } from './newsletter-publish';
function line(id:string,name:string,hsid:string):CanonicalPublicationLine {return {source_id:id,line:[hsid,id,name,'2026-04-07','b',[1,1,1,0,0,0,0,0,0],'123','Team','High-A','HIGH-A','Opponent',[0,0,0,0],true]};}
test('missing-card non-tournament line is reported and skipped; valid SuperFan lines survive',()=>{
 const edge=line('YAT190598','','19354'),active=line('YAT000001','Rostered','5004'),favorite=line('YAT000002','Favorite','123');
 const result=partitionPublicationSource([edge,active,favorite],new Set([active.line[1]]));
 assert.deepEqual(result.included,[active,favorite]);assert.equal(result.skipped[0].yatid,'YAT190598');
 assert.throws(()=>partitionPublicationSource([edge],new Set(['YAT190598'])),/lacks player identity/);
});
