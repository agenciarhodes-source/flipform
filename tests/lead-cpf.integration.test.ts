import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

test('CPF: grants, encrypted storage, atomic writes, tenant isolation, audited reveal and revocation', { skip: process.env.CI !== 'true' }, async () => {
  // Never import the service or open a connection before verifying the disposable database.
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '5432' || url.pathname !== '/flipform_ci' || url.username !== 'postgres') throw Error('Disposable CI DB required');
  const old = process.env.INTEGRATION_SECRET_KEY;
  process.env.INTEGRATION_SECRET_KEY = Buffer.alloc(32, 19).toString('hex');
  const { prisma: db } = await import('../lib/prisma');
  const { setLeadCpf, leadCpfSummary, leadIdsByCpf, revealLeadCpf, clearLeadCpf } = await import('../lib/leads/cpf');
  const { tenantHasFeature } = await import('../lib/billing/tenant-features');
  const ids: string[] = [];
  let userId: string | undefined;
  const suffix = randomUUID();
  const cpf1 = '52998224725';
  const cpf2 = '11144477735';
  try {
    for (const letter of ['a','b']) {
      const t = await db.tenant.create({ data: { name: 'Synthetic CPF '+letter, slug: 'cpf-'+letter+'-'+suffix } });
      ids.push(t.id);
    }
    const user = await db.user.create({ data: { name: 'Synthetic owner', email: suffix+'@example.invalid', passwordHash: 'synthetic' } });
    userId = user.id;
    const [a,b] = ids;
    const leads = [];
    for (const tenantId of ids) {
      const pipeline = await db.pipeline.create({ data: { tenantId, name: 'Synthetic' } });
      const stage = await db.pipelineStage.create({ data: { pipelineId: pipeline.id, name: 'Synthetic', orderIndex: 0 } });
      leads.push(await db.lead.create({ data: { tenantId, pipelineId: pipeline.id, stageId: stage.id, name: 'Synthetic' } }));
    }
    const [leadA,leadB] = leads;
    const identity = { tenantId:a, leadId:leadA.id, userId:user.id };
    assert.equal(await tenantHasFeature(a,'lead_cpf'),false);
    assert.equal((await setLeadCpf({ ...identity, cpf:cpf1, source:'team' })).saved,false);
    assert.equal(await db.leadPersonalDocument.count({where:{tenantId:a}}),0);
    const grant = await db.tenantEntitlementGrant.create({ data:{tenantId:a, feature:'lead_cpf', enabled:true, reason:'synthetic test', approvedBy:user.id, startsAt:new Date(Date.now()-60_000), expiresAt:new Date(Date.now()+3_600_000)} });
    assert.equal(await tenantHasFeature(a,'lead_cpf'),true);
    assert.equal(await tenantHasFeature(b,'lead_cpf'),false);
    assert.equal((await setLeadCpf({tenantId:a,leadId:leadB.id,cpf:cpf1,source:'chat',onlyIfEmpty:true})).saved,false);
    assert.equal((await setLeadCpf({tenantId:b,leadId:leadB.id,cpf:cpf1,source:'chat',onlyIfEmpty:true})).saved,false);
    await Promise.all([
      setLeadCpf({tenantId:a,leadId:leadA.id,cpf:cpf1,source:'chat',onlyIfEmpty:true}),
      setLeadCpf({...identity,cpf:cpf2,source:'team'}),
    ]);
    assert.equal((await leadCpfSummary(a,leadA.id)).source,'team');
    assert.equal((await leadCpfSummary(a,leadA.id)).masked,'***.444.777-**');
    const row = await db.leadPersonalDocument.findUniqueOrThrow({where:{leadId:leadA.id}});
    assert.ok(row.cpfEncrypted.startsWith('ffenc:v1:'));
    assert.ok(!row.cpfEncrypted.includes(cpf2));
    assert.match(row.cpfHash,/^[0-9a-f]{64}$/);
    assert.deepEqual(await leadIdsByCpf(a,cpf2),[leadA.id]);
    assert.deepEqual(await leadIdsByCpf(a,cpf1),[]);
    assert.deepEqual(await leadIdsByCpf(b,cpf2),[]);
    assert.equal(await revealLeadCpf({...identity,tenantId:b}),null);
    assert.equal(await revealLeadCpf(identity),cpf2);
    const audit = await db.auditLog.findMany({where:{tenantId:a,entityId:leadA.id}});
    assert.ok(audit.some(x=>x.action==='lead.cpf_viewed'));
    assert.ok(!JSON.stringify(audit).includes(cpf1));
    assert.ok(!JSON.stringify(audit).includes(cpf2));
    assert.equal((await setLeadCpf({tenantId:a,leadId:leadA.id,cpf:cpf1,source:'document',onlyIfEmpty:true})).saved,false);
    await db.tenantEntitlementGrant.update({where:{id:grant.id},data:{revokedAt:new Date()}});
    assert.equal(await tenantHasFeature(a,'lead_cpf'),false);
    assert.equal((await leadCpfSummary(a,leadA.id)).hasCpf,false);
    assert.deepEqual(await leadIdsByCpf(a,cpf2),[]);
    assert.equal(await clearLeadCpf(identity),false);
    assert.equal(await db.leadPersonalDocument.count({where:{tenantId:a}}),1);
    await db.tenantEntitlementGrant.update({where:{id:grant.id},data:{revokedAt:null}});
    assert.equal(await clearLeadCpf(identity),true);
    assert.equal((await leadCpfSummary(a,leadA.id)).hasCpf,false);
  } finally {
    if (ids.length) {
      const where = { tenantId: { in: ids } };
      await db.leadPersonalDocument.deleteMany({where});
      await db.auditLog.deleteMany({where});
      await db.tenantEntitlementGrant.deleteMany({where});
      await db.lead.deleteMany({where});
      await db.pipelineStage.deleteMany({where:{pipeline:{tenantId:{in:ids}}}});
      await db.pipeline.deleteMany({where});
      await db.tenant.deleteMany({where:{id:{in:ids}}});
    }
    if (userId) await db.user.delete({where:{id:userId}});
    if(old===undefined)delete process.env.INTEGRATION_SECRET_KEY; else process.env.INTEGRATION_SECRET_KEY=old;
    await db.$disconnect();
  }
});
