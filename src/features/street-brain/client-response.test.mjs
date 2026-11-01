import test from 'node:test';
import assert from 'node:assert/strict';
import {readJsonResponse} from './client-response.ts';
test('an empty upstream response produces an actionable error rather than a JSON syntax exception',async()=>{
  await assert.rejects(readJsonResponse(new Response('',{status:502})),/empty response \(502\)/);
});
test('a non-JSON proxy error keeps the HTTP status',async()=>{
  await assert.rejects(readJsonResponse(new Response('<html>Gateway timeout</html>',{status:504})),/unreadable response \(504\)/);
});
test('a JSON service error reaches the resident unchanged',async()=>{
  await assert.rejects(readJsonResponse(Response.json({error:'Storage is not configured'},{status:503})),/Storage is not configured/);
});
