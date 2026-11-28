import assert from 'node:assert/strict';
import test from 'node:test';
import {canDeliverDay,parseDeliveryRequest,verifiedHost,QA_BRANCH,QA_ENDPOINT,LIVE_ENDPOINT} from './rehearsalDeliveryGuard';
test('request allows only preflight or a normalized address and exact historical day, no user-supplied subject/body',()=>{
  assert.deepEqual(parseDeliveryRequest({action:'preflight'}),{action:'preflight'});
  const input={action:'deliver',day:'2026-04-01',email:'test@example.invalid'};
  assert.deepEqual(parseDeliveryRequest(input),input);
  assert.equal(parseDeliveryRequest({...input,html:'anything'}),null);
  assert.equal(parseDeliveryRequest({...input,day:'2026-02-30'}),null);
  assert.equal(parseDeliveryRequest({...input,email:'TEST@example.invalid'}),null);
});
test('delivery requires owner approval, forward cutoff, latest audited QA day and matching cutoff',()=>{
  const day='2026-04-01',control={enabled:true,first_report_date:day};
  const checkpoint={report_date:day,phase:'awaiting_review',branch_id:QA_BRANCH,audit_status:'passed',effective_at:'2026-04-02T11:00:00Z'};
  assert.equal(canDeliverDay(day,control,checkpoint,true),true);
  assert.equal(canDeliverDay(day,control,checkpoint,false),false);
  assert.equal(canDeliverDay(day,{...control,enabled:false},checkpoint,true),false);
  assert.equal(canDeliverDay(day,{...control,first_report_date:'2026-04-02'},checkpoint,true),false);
  assert.equal(canDeliverDay(day,control,{...checkpoint,report_date:'2026-04-02'},true),false);
  assert.equal(canDeliverDay(day,control,{...checkpoint,audit_status:'failed'},true),false);
  assert.equal(canDeliverDay(day,control,{...checkpoint,phase:'running'},true),false);
  assert.equal(canDeliverDay(day,control,{...checkpoint,branch_id:'production'},true),false);
  assert.equal(canDeliverDay(day,control,{...checkpoint,effective_at:'2026-04-02T10:00:00Z'},true),false);
});
test('database host guard never permits production as QA or QA as live',()=>{
  assert.match(verifiedHost('postgres://user:password@'+QA_ENDPOINT+'-pooler.example.invalid/db',QA_ENDPOINT),new RegExp(QA_ENDPOINT+'\\.'));
  assert.throws(()=>verifiedHost('postgres://user:password@'+LIVE_ENDPOINT+'.example.invalid/db',QA_ENDPOINT));
  assert.throws(()=>verifiedHost('postgres://user:password@'+QA_ENDPOINT+'.example.invalid/db',LIVE_ENDPOINT));
});
