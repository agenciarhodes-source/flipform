import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { getAgentDraftWorkspace, saveAgentDraft } from '../lib/flip-ai/agents';
import { FlipAiError } from '../lib/flip-ai/access';
import { getMasterMarkdown, saveMasterMarkdown } from '../lib/flip-ai/knowledge';
import { prepareKnowledgeIndex, processNextKnowledgeIndexBatch, searchKnowledgeByVector } from '../lib/flip-ai/indexing';
import { FLIP_AI_EMBEDDING_DIMENSIONS, OpenAiEmbeddingError } from '../lib/flip-ai/openai-embeddings';
import { previewKnowledgeRetrieval } from '../lib/flip-ai/knowledge-preview';

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
  await prisma.flipAiUsageEvent.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.flipAiKnowledgeChunk.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.flipAiKnowledgeIndexBatch.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.flipAiKnowledgeIndex.deleteMany({ where: { tenantId: x.tenant.id } });
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
    const savedWithKnowledge = await saveAgentDraft(a.session, { ...a.input, name: 'Ana indexada' }, { kind: 'update', id, version: 2 });
    assert.equal(savedWithKnowledge.knowledge?.revision, 2, 'agent save must preserve its knowledge summary');

    const prepared = await prepareKnowledgeIndex(a.session, id, 2);
    assert.equal(prepared.status, 'pending');
    await assert.rejects(prepareKnowledgeIndex(b.session, id, 2), (e: unknown) => e instanceof FlipAiError && e.status === 404);
    const vector = [1, ...Array(FLIP_AI_EMBEDDING_DIMENSIONS - 1).fill(0)];
    const indexed = await processNextKnowledgeIndexBatch(a.session, id, prepared.id, false, async (inputs) => ({
      embeddings: inputs.map(() => vector), model: 'text-embedding-3-small', inputTokens: inputs.length * 5, totalTokens: inputs.length * 5,
    }));
    assert.equal(indexed.status, 'completed');
    assert.equal(await prisma.flipAiUsageEvent.count({ where: { tenantId: a.tenant.id, status: 'confirmed' } }), 1);
    const hits = await searchKnowledgeByVector(a.session, id, vector, 3);
    assert.ok(hits.length > 0);
    assert.equal((await searchKnowledgeByVector(b.session, id, vector, 3)).length, 0, 'retrieval must not cross tenants');

    const previewRequest = { requestId: randomUUID(), query: 'Qual é a informação oficial?' };
    let previewCalls = 0;
    const preview = await previewKnowledgeRetrieval(a.session, id, previewRequest, async () => {
      previewCalls += 1;
      return { embeddings: [vector], model: 'text-embedding-3-small', inputTokens: 7, totalTokens: 7 };
    });
    assert.ok(preview.hits.length > 0);
    const cachedPreview = await previewKnowledgeRetrieval(a.session, id, previewRequest, async () => {
      throw new Error('cached request must not call OpenAI again');
    });
    assert.equal(cachedPreview.cached, true);
    assert.equal(previewCalls, 1);

    const ambiguousRequest = { requestId: randomUUID(), query: 'Teste de resultado incerto' };
    let ambiguousCalls = 0;
    await assert.rejects(previewKnowledgeRetrieval(a.session, id, ambiguousRequest, async () => {
      ambiguousCalls += 1;
      throw new OpenAiEmbeddingError('ambiguous', 'TEST_AMBIGUOUS');
    }), (error: unknown) => error instanceof FlipAiError && error.code === 'TEST_AMBIGUOUS');
    await assert.rejects(previewKnowledgeRetrieval(a.session, id, ambiguousRequest, async () => {
      ambiguousCalls += 1;
      return { embeddings: [vector], model: 'text-embedding-3-small', inputTokens: 3, totalTokens: 3 };
    }), (error: unknown) => error instanceof FlipAiError && error.code === 'KNOWLEDGE_PREVIEW_AMBIGUOUS');
    assert.equal(ambiguousCalls, 1, 'ambiguous preview must not retry without confirmation');
    const retried = await previewKnowledgeRetrieval(a.session, id, { ...ambiguousRequest, confirmRetry: true }, async () => {
      ambiguousCalls += 1;
      return { embeddings: [vector], model: 'text-embedding-3-small', inputTokens: 3, totalTokens: 3 };
    });
    assert.ok(retried.hits.length > 0);
    assert.equal(ambiguousCalls, 2);

    const audit = await prisma.auditLog.findFirst({ where: { tenantId: a.tenant.id, action: 'master_markdown.revision_created' } });
    assert.equal(JSON.stringify(audit?.metadata).includes(master.content), false, 'knowledge content must not leak into audit metadata');

    await prisma.tenantUser.update({ where: { tenantId_userId: { tenantId: a.tenant.id, userId: a.user.id } }, data: { status: 'inactive' } });
    await assert.rejects(getAgentDraftWorkspace(a.session), (e: unknown) => e instanceof FlipAiError && e.status === 403);
    assert.equal(await prisma.lead.count(), leads);
  } finally { await cleanup(a); await cleanup(b); await prisma.$disconnect(); }
});
