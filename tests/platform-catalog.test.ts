import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultApps,mergeCatalog,visibleApps,iconUrl } from '../lib/integration-catalog/presentation';
import { catalogInput,validateIcon } from '../lib/integration-catalog/validation';
const a=defaultApps().find(a=>a.id==='whatsapp')!;
test('global override preserves immutable connector routing and can only restrict presentation',()=>{
  const apps=mergeCatalog([{id:a.id,label:'WhatsApp Empresa',description:'Nova descrição',category:'Atendimento',sortOrder:1,planSlugs:['premium-pro'],iconDigest:'abc',revision:1}]);
  const updated=apps.find(x=>x.id===a.id)!;
  assert.equal(updated.anchor,a.anchor);
  assert.equal(updated.label,'WhatsApp Empresa');
  assert.equal(iconUrl(updated),'/api/integrations/catalog/icon/whatsapp?v=1');
  assert.ok(!visibleApps(apps,'premium',true,false).some(x=>x.id==='whatsapp'));
  assert.ok(visibleApps(apps,'premium-pro',true,false).some(x=>x.id==='whatsapp'));
});
test('custom cards cannot define routing or expand technical plan access',()=>{
  const apps=mergeCatalog([{id:'custom-crm-x',label:'CRM X',description:'Teste',category:'CRM',sortOrder:0,planSlugs:['free','premium-pro'],iconDigest:null,revision:1},{id:'arbitrary',label:'No',description:'',category:'x',sortOrder:0,planSlugs:['free'],iconDigest:null,revision:1}]);
  assert.equal(apps.find(x=>x.id==='custom-crm-x')?.anchor,undefined);
  assert.ok(!apps.some(x=>x.id==='arbitrary'));
  assert.ok(!visibleApps(apps,'free',false,false).some(x=>x.id==='custom-crm-x'));
  assert.ok(visibleApps(apps,'premium-pro',true,false).some(x=>x.id==='custom-crm-x'));
  assert.deepEqual(visibleApps(defaultApps(),'inbox',false,true).map(x=>x.id),['whatsapp']);
});
test('input rejects provider URLs, duplicate plans and invalid images',()=>{
  const base={id:'custom-crm',expectedRevision:0,label:'CRM',description:'',category:'CRM',sortOrder:1,planSlugs:['premium-pro']};
  assert.equal(catalogInput.safeParse(base).success,true);
  assert.equal(catalogInput.safeParse({...base,anchor:'anything'}).success,false);
  assert.equal(catalogInput.safeParse({...base,planSlugs:['premium','premium']}).success,false);
  assert.equal(validateIcon(Buffer.from('<svg/>').toString('base64')),null);
  assert.equal(validateIcon('a'.repeat(87385)),null);
  // PNG fixture with bounded dimensions and complete chunk structure.
  const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415408d763f8cfc0f01f00050001ff89993d1d0000000049454e44ae426082','hex');
  assert.ok(validateIcon(png.toString('base64')));
  png.writeUInt32BE(257,16);assert.equal(validateIcon(png.toString('base64')),null);
});
