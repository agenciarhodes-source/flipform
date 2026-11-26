import assert from 'node:assert/strict';
import test from 'node:test';
import { workspace360Access, NO_WORKSPACE_360, type WorkspaceFacts } from '../lib/workspace-360/policy';
const plan = { slug: 'premium-pro', isActive: true };
const subscription = { status: 'courtesy', provider: 'manual', paymentRequired: false, providerSubscriptionId: null, providerCustomerId: null, plan };
const base: WorkspaceFacts = { tenantId: 'tenant-a', sessionTenantId: 'tenant-a', tenantStatus: 'active', role: 'developer', memberRole: 'viewer', membershipActive: true, plan, subscription };
test('Premium Pro courtesy navigation; API key authorization not granted here', () => {
  assert.deepEqual(workspace360Access(base), {api:true,universal:true,intelligence:true,ads:true});
  assert.deepEqual(workspace360Access({...base,role:'owner',memberRole:'owner'}), {api:false,universal:false,intelligence:true,ads:true});
  assert.deepEqual(workspace360Access({...base,role:'manager',memberRole:'manager'}), {api:false,universal:false,intelligence:true,ads:false});
  for(const role of ['admin','agent','viewer','owner','manager']) assert.deepEqual(workspace360Access({...base,role}), NO_WORKSPACE_360);
});
test('Premium excludes Ads and lower plans excluded', () => {
  const premium = {...plan,slug:'premium'};
  assert.deepEqual(workspace360Access({...base,plan:premium,subscription:{...subscription,plan:premium}}),{api:true,universal:true,intelligence:true,ads:false});
  const basic = {...plan,slug:'pro'};
  assert.deepEqual(workspace360Access({...base,plan:basic,subscription:{...subscription,plan:basic}}),NO_WORKSPACE_360);
});
test('deny cross-tenant, stale plans and ineligible memberships/subscriptions',()=>{
  for(const f of [{...base,sessionTenantId:'tenant-b'}, {...base,membershipActive:false}, {...base,globalRole:'platform_admin'}, {...base,tenantStatus:'suspended'}, {...base,plan:{...plan,isActive:false}}, {...base,subscription:null}, {...base,subscription:{...subscription,plan:{...plan,slug:'premium'}}}, {...base,subscription:{...subscription,paymentRequired:true}}, {...base,subscription:{...subscription,status:'canceled'}}, {...base,subscription:{...subscription,provider:'business_group'}}]) assert.deepEqual(workspace360Access(f),NO_WORKSPACE_360);
});
