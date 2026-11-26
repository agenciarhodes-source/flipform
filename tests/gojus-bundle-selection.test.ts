import assert from 'node:assert/strict';
import test from 'node:test';
import {selectLatestCaseFiles} from '../lib/gojus/bundle-selection';
const doc=(id:string,status='received',time=1)=>({messageId:id,itemKey:'rg',status,createdAt:new Date(time)});
test('latest verified copy is selected; newer problems and ties block',()=>{
  assert.deepEqual(selectLatestCaseFiles(['rg'],[doc('old'),doc('new','received',2)]),['new']);
  assert.equal(selectLatestCaseFiles(['rg'],[doc('old'),doc('new','problem',2)]),null);
  assert.equal(selectLatestCaseFiles(['rg'],[doc('a'),doc('b')]),null);
  assert.equal(selectLatestCaseFiles(['rg','cpf'],[doc('a')]),null);
  assert.equal(selectLatestCaseFiles([],[]),null);
});
