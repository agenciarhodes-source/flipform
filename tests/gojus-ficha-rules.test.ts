import assert from 'node:assert/strict';
import test from 'node:test';
import { GOJUS_FIELD_MAP, validateGoJusFieldMap, prepareGoJusFields, type GoJusFieldMap } from '../lib/gojus/ficha-rules';

const fixture:GoJusFieldMap={version:'synthetic-test-only',verified:true,fields:[
  {key:'second',screen:'Synthetic screen',label:'Synthetic email',source:'lead.email',required:false,order:2,confirmation:'Visible value'},
  {key:'first',screen:'Synthetic screen',label:'Synthetic name',source:'lead.name',required:true,order:1,confirmation:'Visible value'},
]};
test('unverified annex exposes no fields and cannot be ready',()=>{
  assert.equal(validateGoJusFieldMap(GOJUS_FIELD_MAP).ready,false);
  const result=prepareGoJusFields(GOJUS_FIELD_MAP,{'lead.name':'Synthetic'});
  assert.equal(result.ready,false);assert.deepEqual(result.fields,[]);
  assert.equal(prepareGoJusFields({...fixture,verified:false},{'lead.name':'Synthetic'}).ready,false);
});
test('verified synthetic mapping orders exact fields and detects mandatory gaps',()=>{
  const blank=prepareGoJusFields(fixture,{'lead.name':'   '});
  assert.equal(blank.ready,false);assert.deepEqual(blank.missing.map(f=>f.key),['first']);
  assert.deepEqual(blank.fields.map(f=>f.key),['first','second']);
  assert.equal(prepareGoJusFields(fixture,{'lead.name':' Synthetic '}).ready,true);
  assert.equal(prepareGoJusFields(fixture,{'lead.name':' Synthetic '}).fields[0].value,'Synthetic');
});
test('duplicate positions, keys, missing labels and unconfirmed required flags cannot pass',()=>{
  assert.equal(validateGoJusFieldMap({...fixture,fields:[fixture.fields[0],{...fixture.fields[1],order:2}]}).ready,false);
  assert.equal(validateGoJusFieldMap({...fixture,fields:[fixture.fields[0],{...fixture.fields[1],key:'second'}]}).ready,false);
  assert.equal(validateGoJusFieldMap({...fixture,fields:[{...fixture.fields[0],label:''}]}).ready,false);
  assert.equal(validateGoJusFieldMap({...fixture,fields:[{...fixture.fields[0],confirmation:''}]}).ready,false);
});
