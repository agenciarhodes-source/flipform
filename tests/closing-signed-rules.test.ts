import assert from 'node:assert/strict';
import test from 'node:test';
import { expectedClosingDocs, closingStatus, closingItemKey, signedStatusFromReader, type SignedDocument } from '../lib/closing-documents/signed-rules';

const templates = [{id:'a',name:'Procuração'},{id:'b',name:'Contrato'},{id:'c',name:'Declaração'}];
const expected = expectedClosingDocs(templates,'adult','separate',true);
const row = (id: string, status: SignedDocument['status']='received', time=1): SignedDocument => ({itemKey:closingItemKey(id),messageId:id+'-'+time,status,note:null,createdAt:new Date(time)});

test('only confirmed full manifests with explicit return mode may be complete',()=>{
  assert.equal(expected.length,3);
  assert.deepEqual(expectedClosingDocs(templates,'adult',null,true),[]);
  assert.deepEqual(expectedClosingDocs(templates,'adult','separate',false),[]);
  assert.deepEqual(expectedClosingDocs(templates.slice(0,2),'adult','separate',true),[]);
  assert.deepEqual(expectedClosingDocs(templates,'adult','package',true),[]);
  assert.equal(expectedClosingDocs([{id:'p',name:'Pacote'}],'rogo','package',true).length,1);
  assert.deepEqual(expectedClosingDocs([templates[0],templates[0],templates[2]],'adult','separate',true),[]);
  assert.equal(closingStatus([],[]).complete,false);
});
test('missing files, latest correction, no false completion on conflicting timestamps',()=>{
  const partial = closingStatus(expected,[row('a')]);
  assert.equal(partial.complete,false);
  assert.equal(partial.missing.length,2);
  assert.equal(closingStatus(expected,[row('a'),row('b'),row('c')]).complete,true);
  const problem = closingStatus(expected,[row('a'),row('b'),row('c'),row('a','problem',2)]);
  assert.equal(problem.complete,false);
  assert.equal(problem.problems.length,1);
  assert.equal(closingStatus(expected,[row('a','problem'),row('a','received',2),row('b'),row('c')]).complete,true);
  assert.equal(closingStatus(expected,[row('a'),row('a','problem'),row('b'),row('c')]).complete,false);
  assert.equal(closingStatus(expected,[row('x'),row('b'),row('c')]).complete,false);
});
test('reader requires signatures, fields, pages and legibility; no free-form note retained',()=>{
  const ok = {closingTemplate:'Procuração',signed:true,filled:true,pagesNote:null,legible:true};
  assert.equal(signedStatusFromReader(ok).status,'received');
  assert.equal(signedStatusFromReader({...ok,signed:false}).status,'problem');
  assert.equal(signedStatusFromReader({...ok,filled:false}).status,'problem');
  assert.equal(signedStatusFromReader({...ok,legible:false}).status,'unreadable');
  const pages = signedStatusFromReader({...ok,pagesNote:'texto privado'});
  assert.equal(pages.status,'problem');
  assert.ok(!pages.note?.includes('texto privado'));
});
