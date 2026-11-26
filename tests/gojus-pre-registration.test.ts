import assert from 'node:assert/strict';
import test from 'node:test';
import { GOJUS_PRE_REGISTRATION,planGoJusBundle,type BundleFile } from '../lib/gojus/pre-registration-rules';
test('observed form does not enable automation or provide a credential source',()=>{
  assert.equal(GOJUS_PRE_REGISTRATION.verifiedForAutomation,false);
  assert.equal(GOJUS_PRE_REGISTRATION.fields.find(f=>f.label==='Senha do INSS')?.source,null);
  assert.equal(GOJUS_PRE_REGISTRATION.attachment.count,1);
});
const file=(id:string,kind:BundleFile['kind']):BundleFile=>({id,kind,tenantId:'synthetic-a',leadId:'lead',conversationId:'conversation',mime:'application/pdf',status:'received',order:1,sizeBytes:100});
const input={tenantId:'synthetic-a',leadId:'lead',conversationId:'conversation',expectedIds:['a','b','c'],files:[file('c','signed'),file('a','personal'),file('b','case')],maxInputBytes:1000};
test('bundle manifest has deterministic order and no AI dependency',()=>{
  assert.deepEqual(planGoJusBundle(input),{ready:true,files:['a','b','c'],errors:[]});
});
test('missing, foreign, duplicate, unreviewed or oversized documents block bundle',()=>{
  for(const files of [input.files.slice(1),[...input.files,input.files[0]],[{...input.files[0],tenantId:'foreign'},...input.files.slice(1)],[{...input.files[0],conversationId:'other'},...input.files.slice(1)],[{...input.files[0],status:'problem'},...input.files.slice(1)],[{...input.files[0],mime:'text/html'},...input.files.slice(1)]])assert.equal(planGoJusBundle({...input,files}).ready,false);
  assert.equal(planGoJusBundle({...input,maxInputBytes:100}).ready,false);
});
