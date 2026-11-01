import test from 'node:test';
import assert from 'node:assert/strict';
import {prioritise} from './policy.ts';
const answer=(name,probability)=>({type:'predicate',name,probability});
const owner=(value,confidence=.95)=>({type:'choice',name:'responsibility',choice:value,confidence});
const category={type:'choice',name:'category',choice:'Excessive Litter',confidence:.9};
const base=[answer('relevant_issue',.98),answer('immediate_danger',.01),category];
test('a selfie-only image is rejected without inventing a severity',()=>{
  const r=prioritise([answer('relevant_issue',.05),answer('immediate_danger',.01)],'Hackney');
  assert.equal(r.outcome,'rejected');assert.equal(r.severity,null);
});
test('credible immediate danger gets safety review even on a TfL asset',()=>{
  const r=prioritise([...base,answer('immediate_danger',.95),owner('TfL')].filter((x,i,a)=>x.name!=='immediate_danger'||i===a.findLastIndex(v=>v.name==='immediate_danger')),'Hackney');
  assert.equal(r.severity,5);assert.equal(r.queueOrder,0);assert.equal(r.outcome,'review');
});
test('an ordinary Underground issue is routed to TfL',()=>{
  const r=prioritise([...base,owner('TfL')],'Hackney');assert.equal(r.outcome,'referred');assert.equal(r.responsibility,'TfL');
});
test('missing risk or ownership evidence is not treated as low severity',()=>{
  const r=prioritise([...base,owner('uncertain',.3)],'');assert.equal(r.outcome,'review');assert.equal(r.policyLevel,'U · unassessed');assert.equal(r.queue,'Evidence review');
});
