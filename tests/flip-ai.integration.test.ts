import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { getAgentDraftWorkspace, saveAgentDraft } from '../lib/flip-ai/agents';
import { FlipAiError } from '../lib/flip-ai/access';
import { getMasterMarkdown, saveMasterMarkdown } from '../lib/flip-ai/knowledge';

function assertDisposableDatabase() {
  const url = new URL(process.env.DATABASE_URL || 'https://invalid');
  if (process.env.CI !== 'true' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/flipform_ci') {
    throw new Error('Flip AI fixtures require CI=true and local disposable flipform_ci database.');
  }
}
async function fixture() {
  const suffix = randomUUID();
  const plan = await prisma.plan.upsert({ where: { slug: 'premium' }, update: {}, create: { name: 'Premium CI', slug: 'premium', price: 797 } });
  const user = await prisma.user.create({ data: { name: 'Flip AI CI', email: suffix + '@example.invalid', passwordHash: 'unused' } });
  const tenant = await prisma.tenant.create({ data: { name: 'Flip AI CI', slug: 'flip-ai-ci-' + suffix, planId: plan.id, status: 'active' } });
  await prisma.tenantUser.create({ data: { tenantId: tenant.id, userId: user.id, role: 'owner' } });
  await prisma.subscription.create({ data: { tenantId: tenant.id, planId: plan.id, status: 'active' } });
  const pipeline = await prisma.pipeline.create({ data: { tenantId: tenant.id, name: 'Pipeline CI', stages: { create: { name: 'Novo CI', orderIndex: 0 } } }, include: { stages: true } });
  return { tenant, user, pipeline, session: { tenantId: tenant.id, tenantSlug: tenant.slug, userId: user.id, email: user.email, name: user.name, role: 'owner' },
    input: { name: 'Helena', description: 'CI', primaryColor: '#2563EB', style: 'welcoming' as const, slug: 'helena-' + suffix, pipelineId: pipeline.id, initialStageId: pipeline.stages[0].id } };
}
async function cleanup(x: Awaited<ReturnType<typeof fixture>>) {
  const bases = await prisma.flipAiKnowledgeBase.findMany({ where: { tenantId: x.tenant.id }, select: { id: true } });
  const documents = await prisma.flipAiKnowledgeDocument.findMany({ where: { tenantId: x.tenant.id }, select: { id: true } });
  await prisma.flipAiKnowledgeRevision.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.flipAiKnowledgeDocument.deleteMany({ where: { id: { in: documents.map((item) => item.id) } } });
  await prisma.flipAiKnowledgeBase.deleteMany({ where: { id: { in: bases.map((item) => item.id) } } });
  await prisma.flipAiEndpoint.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.flipAiAgent.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.tenant.delete({ where: { id: x.tenant.id } });
  await prisma.user.delete({ where: { id: x.user.id } });
}
test('drafts are tenant-isolated, idempotent and transactional', async () => {
  assertDisposableDatabase();
  const a = await fixture(); const b = await fixture(); const leads = await prisma.lead.count();
  try {
    const id = randomUUID();
    const created = await Promise.all([1, 2].map(() => saveAgentDraft(a.session, a.input, { kind: 'create', requestId: id })));
    assert.equal(created[0].id, created[1].id);
    assert.equal(await prisma.flipAiAgent.count({ where: { tenantId: a.tenant.id } }), 1);
    assert.equal((await getAgentDraftWorkspace(b.session)).agents.length, 0);
    await assert.rejects(saveAgentDraft(b.session, b.input, { kind: 'update', id, version: 1 }), (e: unknown) => e instanceof FlipAiError && e.status === 404);
    await assert.rejects(saveAgentDraft(a.session, { ...a.input, pipelineId: b.pipeline.id, initialStageId: b.pipeline.stages[0].id }, { kind: 'create', requestId: randomUUID() }),
      (e: unknown) => e instanceof FlipAiError && e.code === 'INVALID_DESTINATION');
    await assert.rejects(saveAgentDraft(b.session, { ...b.input, slug: a.input.slug }, { kind: 'create', requestId: randomUUID() }));
    assert.equal(await prisma.flipAiAgent.count({ where: { tenantId: b.tenant.id } }), 0);
    const updated = await saveAgentDraft(a.session, { ...a.input, name: 'Ana' }, { kind: 'update', id, version: 1 });
    assert.equal(updated.version, 2);
    await assert.rejects(saveAgentDraft(a.session, a.input, { kind: 'update', id, version: 1 }), (e: unknown) => e instanceof FlipAiError && e.code === 'VERSION_CONFLICT');
    const master = { title: 'Empresa CI', content: '# Empresa CI\n\nInformações oficiais para atendimento.', expectedRevision: 0 };
    const first = await saveMasterMarkdown(a.session, id, master);
    const repeated = await saveMasterMarkdown(a.session, id, master);
    assert.equal(first.revision, 1);
    assert.equal(repeated.revision, 1);
    assert.equal(await prisma.flipAiKnowledgeRevision.count({ where: { tenantId: a.tenant.id } }), 1);
    await assert.rejects(saveMasterMarkdown(b.session, id, master), (e: unknown) => e instanceof FlipAiError && e.status === 404);
    const second = await saveMasterMarkdown(a.session, id, { ...master, content: master.content + '\nNovo conteúdo.', expectedRevision: 1 });
    assert.equal(second.revision, 2);
    assert.equal((await getMasterMarkdown(a.session, id))?.content.endsWith('Novo conteúdo.'), true);
    await assert.rejects(saveMasterMarkdown(a.session, id, { ...master, content: master.content + '\nConflito.', expectedRevision: 1 }),
      (e: unknown) => e instanceof FlipAiError && e.code === 'KNOWLEDGE_VERSION_CONFLICT');
    await assert.rejects(saveMasterMarkdown(a.session, id, { ...master, content: '界'.repeat(400_000), expectedRevision: 2 }),
      (e: unknown) => e instanceof FlipAiError && e.status === 413);
    const audit = await prisma.auditLog.findFirst({ where: { tenantId: a.tenant.id, action: 'master_markdown.revision_created' } });
    assert.equal(JSON.stringify(audit?.metadata).includes(master.content), false, 'knowledge content must not leak into audit metadata');

    await prisma.tenantUser.update({ where: { tenantId_userId: { tenantId: a.tenant.id, userId: a.user.id } }, data: { status: 'inactive' } });
    await assert.rejects(getAgentDraftWorkspace(a.session), (e: unknown) => e instanceof FlipAiError && e.status === 403);
    assert.equal(await prisma.lead.count(), leads);
  } finally { await cleanup(a); await cleanup(b); await prisma.$disconnect(); }
});
