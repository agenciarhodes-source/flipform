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
import { completePublicChatTurn, getOrCreatePublicSessionToken, preparePublicChatTurn } from '../lib/flip-ai/public-chat';
import { captureFlipAiLead } from '../lib/flip-ai/lead-capture';
import { finalizeFlipAiQualification } from '../lib/flip-ai/qualification';
import { createExternalSource, listExternalSources, updateExternalSource } from '../lib/flip-ai/external-sources';
import { issuePublicRealtimeSession } from '../lib/flip-ai/realtime-session';
import { inspectFlipAiSchema } from '../lib/flip-ai/schema-readiness';
import { getFlipAiUsageDashboard } from '../lib/flip-ai/usage';
import { getFlipAiCreditWallet, getFlipAiCreditWalletForTenant, grantFlipAiCreditsByPlatformAdmin, recordFlipAiCreditEntry } from '../lib/flip-ai/credits';
import { refundFlipAiUsageCharge, settleFlipAiUsageCharge } from '../lib/flip-ai/usage-billing';
import { changeAgentPublication } from '../lib/flip-ai/publication';
import {
  cancelFlipAiTopUpOrder,
  createFlipAiTopUpOrder,
  creditFlipAiTopUpOrder,
  listFlipAiTopUpOrdersForTenant,
  markFlipAiTopUpPaid,
} from '../lib/flip-ai/top-ups';

function assertDisposableDatabase() {
  const url = new URL(process.env.DATABASE_URL || 'https://invalid');
  if (process.env.CI !== 'true' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/flipform_ci') {
    throw new Error('Flip AI fixtures require CI=true and local disposable flipform_ci database.');
  }
}

test('schema readiness catalog inspection executes read-only against disposable PostgreSQL', async () => {
  assertDisposableDatabase();
  const readiness = await inspectFlipAiSchema();
  assert.equal(readiness.ready, false, 'db push is not the approved migration rollout');
  assert.equal(readiness.missingTables.length, 0);
  assert.deepEqual(readiness.incompatibleTables, []);
  assert.deepEqual(readiness.missingColumns, []);
  // Prisma db push leaves scalar lists nullable; the approved migrations intentionally enforce NOT NULL.
  assert.deepEqual(readiness.incompatibleColumns, [
    'flip_ai_external_search_cache.updated_at',
    'flip_ai_external_sources.updated_at',
    'flip_ai_qualifications.evidence_message_ids',
    'flip_ai_qualifications.reasons',
  ], 'db push intentionally differs on @updatedAt defaults and scalar-list nullability');
  assert.deepEqual(readiness.unexpectedColumns, []);
  // db push cannot reproduce these migration catalog names; the rollout gate still requires all 57.
  assert.deepEqual(readiness.missingIndexes, [
    'flip_ai_external_search_cache_tenant_agent_expires_idx',
    'flip_ai_external_search_cache_tenant_agent_query_allowlist_key',
    'flip_ai_knowledge_chunks_embedding_hnsw_idx',
    'flip_ai_knowledge_indexes_document_id_revision_embedding_model_',
    'flip_ai_qualifications_tenant_id_qualified_lead_tracking_status',
    'flip_ai_rate_limit_buckets_tenant_id_rejected_count_updated_at_',
    'flip_ai_rate_limit_buckets_tenant_id_scope_scope_key_window_sta',
  ]);
  assert.deepEqual(readiness.incompatibleIndexes, []);
  assert.deepEqual(readiness.unexpectedIndexes, [
    'flip_ai_external_search_cache_tenant_id_agent_id_expires_at_idx',
    'flip_ai_external_search_cache_tenant_id_agent_id_query_hash_key',
    'flip_ai_knowledge_indexes_document_id_revision_embedding_mo_key',
    'flip_ai_qualifications_tenant_id_qualified_lead_tracking_st_idx',
    'flip_ai_rate_limit_buckets_tenant_id_rejected_count_updated_idx',
    'flip_ai_rate_limit_buckets_tenant_id_scope_scope_key_window_key',
  ], 'db push names differ from the reviewed migration catalog names');
  assert.deepEqual(readiness.unexpectedConstraints, [
    'flip_ai_knowledge_indexes.flip_ai_knowledge_indexes_tenant_id_document_id_revision_fkey',
  ], 'db push uses a generated FK name instead of the reviewed migration name');
  assert.deepEqual(readiness.incompatibleForeignKeyTriggers, [
    'flip_ai_knowledge_indexes_source_revision_fkey',
  ], 'db push cannot provide triggers for the reviewed migration-only FK name');
  assert.equal(readiness.unexpectedTriggers.length, 4,
    'the generated db-push FK contributes four unexpected internal triggers');
  assert.ok(readiness.unexpectedTriggers.every((trigger) =>
    /\.RI_ConstraintTrigger_[ac]_\d+$/.test(trigger)));
  assert.ok(Array.isArray(readiness.incompatibleConstraints));
});

async function getPremiumPlanForFixture() {
  return prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(3420001)`;
    return db.plan.upsert({
      where: { slug: 'premium' },
      update: {},
      create: { name: 'Premium CI', slug: 'premium', price: 797 },
    });
  });
}

async function fixture() {
  const suffix = randomUUID();
  const plan = await getPremiumPlanForFixture();
  const user = await prisma.user.create({ data: { name: 'Flip AI CI', email: suffix + '@example.invalid', passwordHash: 'unused' } });
  const tenant = await prisma.tenant.create({ data: { name: 'Flip AI CI', slug: 'flip-ai-ci-' + suffix, planId: plan.id, status: 'active' } });
  await prisma.tenantUser.create({ data: { tenantId: tenant.id, userId: user.id, role: 'owner' } });
  await prisma.subscription.create({ data: { tenantId: tenant.id, planId: plan.id, status: 'active' } });
  const pipeline = await prisma.pipeline.create({ data: { tenantId: tenant.id, name: 'Pipeline CI', stages: { create: { name: 'Novo CI', orderIndex: 0 } } }, include: { stages: true } });
  return { tenant, user, pipeline, session: { tenantId: tenant.id, tenantSlug: tenant.slug, userId: user.id, email: user.email, name: user.name, role: 'owner' },
    input: { name: 'Helena', description: 'CI', primaryColor: '#2563EB', style: 'welcoming' as const,
      slug: 'helena-' + suffix, pipelineId: pipeline.id, initialStageId: pipeline.stages[0].id, rotationId: null } };
}
async function cleanup(x: Awaited<ReturnType<typeof fixture>>) {
  await prisma.flipAiExternalSource.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.flipAiTopUpOrder.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.flipAiCreditLedgerEntry.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.flipAiCreditAccount.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.flipAiUsageEvent.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.flipAiRateLimitBucket.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.flipAiQualification.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.flipAiConversationState.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.message.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.conversation.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.externalContactIdentity.deleteMany({ where: { tenantId: x.tenant.id } });
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
test('commercial top-ups are tenant-isolated, payment-gated and idempotent', async () => {
  assertDisposableDatabase();
  const a = await fixture();
  const b = await fixture();
  try {
    const requestKey = `top-up-ci:${randomUUID()}`;
    const created = await createFlipAiTopUpOrder({
      tenantId: a.tenant.id,
      requestKey,
      amountCents: 19990,
      credits: 100_000,
      estimatedOpenAiCostCents: 890,
      actorUserId: a.user.id,
    });
    assert.equal(created.reused, false);
    assert.equal(created.order.status, 'pending');

    const replay = await createFlipAiTopUpOrder({
      tenantId: a.tenant.id,
      requestKey,
      amountCents: 19990,
      credits: 100_000,
      estimatedOpenAiCostCents: 890,
      actorUserId: a.user.id,
    });
    assert.equal(replay.reused, true);
    assert.equal(replay.order.id, created.order.id);
    assert.equal(await prisma.flipAiTopUpOrder.count({
      where: { tenantId: a.tenant.id, requestKey },
    }), 1);

    await assert.rejects(createFlipAiTopUpOrder({
      tenantId: a.tenant.id,
      requestKey,
      amountCents: 29990,
      credits: 100_000,
      estimatedOpenAiCostCents: 890,
      actorUserId: a.user.id,
    }), (error: unknown) => error instanceof FlipAiError
      && error.code === 'FLIP_AI_TOP_UP_IDEMPOTENCY_CONFLICT');

    assert.equal((await listFlipAiTopUpOrdersForTenant(a.tenant.id)).orders.length, 1);
    assert.equal((await listFlipAiTopUpOrdersForTenant(b.tenant.id)).orders.length, 0);
    assert.equal((await getFlipAiCreditWalletForTenant(a.tenant.id)).balanceCredits, 0,
      'a pending commercial order must never pre-credit the wallet');

    await assert.rejects(creditFlipAiTopUpOrder({
      tenantId: a.tenant.id,
      orderId: created.order.id,
      actorUserId: a.user.id,
    }), (error: unknown) => error instanceof FlipAiError
      && error.code === 'FLIP_AI_TOP_UP_NOT_PAID');

    await assert.rejects(markFlipAiTopUpPaid({
      tenantId: b.tenant.id,
      orderId: created.order.id,
      paymentProvider: 'manual',
      providerPaymentId: `receipt:${randomUUID()}`,
      paymentMethod: 'pix',
      actorUserId: b.user.id,
    }), (error: unknown) => error instanceof FlipAiError
      && error.code === 'FLIP_AI_TOP_UP_NOT_FOUND');

    const providerPaymentId = `receipt:${randomUUID()}`;
    const paid = await markFlipAiTopUpPaid({
      tenantId: a.tenant.id,
      orderId: created.order.id,
      paymentProvider: 'manual',
      providerPaymentId,
      paymentMethod: 'pix',
      actorUserId: a.user.id,
    });
    assert.equal(paid.order.status, 'paid');
    assert.equal((await getFlipAiCreditWalletForTenant(a.tenant.id)).balanceCredits, 0,
      'payment confirmation alone must not mutate the wallet');

    const credited = await creditFlipAiTopUpOrder({
      tenantId: a.tenant.id,
      orderId: created.order.id,
      actorUserId: a.user.id,
    });
    assert.equal(credited.order.status, 'credited');
    assert.equal(credited.balanceCredits, 100_000);
    assert.ok(credited.order.creditLedgerEntryId);
    assert.equal(await prisma.flipAiCreditLedgerEntry.count({
      where: {
        tenantId: a.tenant.id,
        idempotencyKey: `top-up:${created.order.id}`,
        source: 'top_up',
      },
    }), 1);

    const creditReplay = await creditFlipAiTopUpOrder({
      tenantId: a.tenant.id,
      orderId: created.order.id,
      actorUserId: a.user.id,
    });
    assert.equal(creditReplay.reused, true);
    assert.equal((await getFlipAiCreditWalletForTenant(a.tenant.id)).balanceCredits, 100_000,
      'credit replay must not duplicate tenant balance');

    const pendingToCancel = await createFlipAiTopUpOrder({
      tenantId: a.tenant.id,
      requestKey: `cancel-ci:${randomUUID()}`,
      amountCents: 9900,
      credits: 40_000,
      estimatedOpenAiCostCents: 300,
      actorUserId: a.user.id,
    });
    const canceled = await cancelFlipAiTopUpOrder({
      tenantId: a.tenant.id,
      orderId: pendingToCancel.order.id,
      actorUserId: a.user.id,
    });
    assert.equal(canceled.order.status, 'canceled');
    await assert.rejects(creditFlipAiTopUpOrder({
      tenantId: a.tenant.id,
      orderId: pendingToCancel.order.id,
      actorUserId: a.user.id,
    }), (error: unknown) => error instanceof FlipAiError
      && error.code === 'FLIP_AI_TOP_UP_NOT_PAID');

    assert.equal(await prisma.flipAiCreditLedgerEntry.count({
      where: { tenantId: b.tenant.id },
    }), 0, 'one tenant top-up must never create ledger entries for another tenant');
  } finally {
    await cleanup(a);
    await cleanup(b);
  }
});

test('Stripe-linked top-up cannot be manually confirmed or credited', async () => {
  assertDisposableDatabase();
  const x = await fixture();
  try {
    const created = await createFlipAiTopUpOrder({
      tenantId: x.tenant.id,
      requestKey: `stripe-gate-ci:${randomUUID()}`,
      amountCents: 19990,
      credits: 100_000,
      estimatedOpenAiCostCents: 890,
      actorUserId: x.user.id,
    });

    await prisma.flipAiTopUpOrder.update({
      where: { id: created.order.id },
      data: {
        paymentProvider: 'stripe',
        paymentMethod: 'card_test_checkout',
        stripeCheckoutAttempt: 1,
      },
    });

    await assert.rejects(markFlipAiTopUpPaid({
      tenantId: x.tenant.id,
      orderId: created.order.id,
      paymentProvider: 'stripe',
      providerPaymentId: `pi_test_${randomUUID()}`,
      paymentMethod: 'card',
      actorUserId: x.user.id,
    }), (error: unknown) => error instanceof FlipAiError
      && error.code === 'FLIP_AI_TOP_UP_STRIPE_PAYMENT_REQUIRES_VERIFICATION');

    await assert.rejects(creditFlipAiTopUpOrder({
      tenantId: x.tenant.id,
      orderId: created.order.id,
      actorUserId: x.user.id,
    }), (error: unknown) => error instanceof FlipAiError
      && error.code === 'FLIP_AI_TOP_UP_NOT_PAID');

    assert.equal((await getFlipAiCreditWalletForTenant(x.tenant.id)).balanceCredits, 0);
  } finally {
    await cleanup(x);
  }
});

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
    const updated = await saveAgentDraft(a.session, {
      ...a.input,
      name: 'Ana',
      actionCapabilities: {
        inPersonService: false,
        customerVisit: true,
        productDemo: false,
        inPersonScheduling: true,
      },
    }, { kind: 'update', id, version: 1 });
    assert.equal(updated.version, 2);
    assert.deepEqual(updated.actionCapabilities, {
      inPersonService: false,
      customerVisit: true,
      productDemo: false,
      inPersonScheduling: true,
    });
    const capabilityWorkspace = await getAgentDraftWorkspace(a.session);
    assert.equal(capabilityWorkspace.actionCapabilitiesReady, true);
    assert.deepEqual(capabilityWorkspace.agents.find((agent) => agent.id === id)?.actionCapabilities,
      updated.actionCapabilities);
    await assert.rejects(saveAgentDraft(a.session, a.input, { kind: 'update', id, version: 1 }), (e: unknown) => e instanceof FlipAiError && e.code === 'VERSION_CONFLICT');
    await assert.rejects(changeAgentPublication(a.session, id, {
      action: 'publish', version: updated.version,
    }, { openAiConfigured: true }), (error: unknown) =>
      error instanceof FlipAiError && error.code === 'AGENT_NOT_READY');
    assert.equal((await prisma.flipAiAgent.findUniqueOrThrow({ where: { id } })).status, 'draft',
      'failed readiness must never expose the public chat');

    const sourceRequest = { requestId: randomUUID(), label: 'Site oficial', domain: 'WWW.Empresa.COM.BR' };
    const source = await createExternalSource(a.session, id, sourceRequest);
    const repeatedSource = await createExternalSource(a.session, id, sourceRequest);
    assert.equal(source.id, repeatedSource.id, 'external source create must be idempotent');
    assert.equal(source.domain, 'www.empresa.com.br');
    assert.equal((await listExternalSources(a.session, id)).length, 1);
    await assert.rejects(listExternalSources(b.session, id),
      (e: unknown) => e instanceof FlipAiError && e.status === 404);
    await assert.rejects(updateExternalSource(b.session, id, source.id,
      { label: source.label, status: 'inactive', version: source.version }),
      (e: unknown) => e instanceof FlipAiError && e.status === 404);
    const inactiveSource = await updateExternalSource(a.session, id, source.id,
      { label: source.label, status: 'inactive', version: source.version });
    assert.equal(inactiveSource.status, 'inactive');
    assert.equal(inactiveSource.version, source.version + 1);
    await assert.rejects(updateExternalSource(a.session, id, source.id,
      { label: source.label, status: 'active', version: source.version }),
      (e: unknown) => e instanceof FlipAiError && e.code === 'VERSION_CONFLICT');
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
    const savedWithKnowledge = await saveAgentDraft(a.session, {
      ...a.input,
      name: 'Ana indexada',
      actionCapabilities: updated.actionCapabilities,
    }, { kind: 'update', id, version: 2 });
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

    const lateRequest = { requestId: randomUUID(), query: 'Teste de propriedade da tentativa' };
    let signalStarted!: () => void;
    let releaseEmbedding!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const lateAttempt = previewKnowledgeRetrieval(a.session, id, lateRequest, async () => {
      signalStarted();
      return new Promise((resolve) => { releaseEmbedding = () => resolve({
        embeddings: [vector], model: 'text-embedding-3-small', inputTokens: 11, totalTokens: 11,
      }); });
    });
    await started;
    const lateEvent = await prisma.flipAiUsageEvent.findUniqueOrThrow({
      where: { requestKey: `knowledge-preview:${lateRequest.requestId}` },
    });
    await prisma.flipAiUsageEvent.update({ where: { id: lateEvent.id }, data: {
      metadata: { ...(lateEvent.metadata as Record<string, unknown>), attemptStartedAt: new Date(0).toISOString() } as any,
    } });
    await assert.rejects(previewKnowledgeRetrieval(a.session, id, lateRequest, async () => {
      throw new Error('stale processing must first become ambiguous');
    }), (error: unknown) => error instanceof FlipAiError && error.code === 'KNOWLEDGE_PREVIEW_AMBIGUOUS');
    const ownedRetry = await previewKnowledgeRetrieval(a.session, id, { ...lateRequest, confirmRetry: true }, async () => ({
      embeddings: [vector], model: 'text-embedding-3-small', inputTokens: 13, totalTokens: 13,
    }));
    assert.equal(ownedRetry.inputTokens, 13);
    releaseEmbedding();
    await assert.rejects(lateAttempt, (error: unknown) =>
      error instanceof FlipAiError && error.code === 'PREVIEW_PERSISTENCE_AMBIGUOUS');
    const ownedEvent = await prisma.flipAiUsageEvent.findUniqueOrThrow({ where: { id: lateEvent.id } });
    assert.equal(ownedEvent.status, 'confirmed');
    assert.equal(ownedEvent.inputTokens, 13, 'late attempt must not overwrite the confirmed retry');

    await assert.rejects(changeAgentPublication(b.session, id, {
      action: 'publish', version: savedWithKnowledge.version,
    }, { openAiConfigured: true }), (error: unknown) =>
      error instanceof FlipAiError && error.status === 404);
    const published = await changeAgentPublication(a.session, id, {
      action: 'publish', version: savedWithKnowledge.version,
    }, { openAiConfigured: true });
    assert.equal(published.status, 'published');
    assert.equal(published.publication.ready, true);
    assert.equal(published.publication.publicPath, `/chat/${a.input.slug}`);
    const publicationReplay = await changeAgentPublication(a.session, id, {
      action: 'publish', version: savedWithKnowledge.version,
    }, { openAiConfigured: true });
    assert.equal(publicationReplay.reused, true, 'publication replay must be idempotent');
    const editedPublished = await saveAgentDraft(a.session, {
      ...a.input,
      name: 'Helena publicada',
      primaryColor: '#864040',
      actionCapabilities: savedWithKnowledge.actionCapabilities,
    }, { kind: 'update', id, version: published.version });
    assert.equal(editedPublished.status, 'published', 'editing must keep the public chat online');
    assert.equal(editedPublished.name, 'Helena publicada');
    assert.equal(editedPublished.primaryColor, '#864040');
    assert.equal(editedPublished.version, published.version + 1);
    const publishedUpdateAudit = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId: a.tenant.id, entityId: id, action: 'updated' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { metadata: true },
    });
    const publishedUpdateMetadata = publishedUpdateAudit.metadata as {
      status?: string;
      actionCapabilities?: unknown;
    } | null;
    assert.equal(publishedUpdateMetadata?.status, 'published',
      'live edits must be auditable as published changes');
    assert.deepEqual(publishedUpdateMetadata?.actionCapabilities, editedPublished.actionCapabilities,
      'capability changes must remain auditable on the agent');
    const publishedWorkspace = await getAgentDraftWorkspace(a.session);
    assert.equal(publishedWorkspace.agents.find((agent) => agent.id === id)?.status, 'published');
    assert.equal(await prisma.auditLog.count({
      where: { tenantId: a.tenant.id, entityId: id, action: 'published' },
    }), 1);
    const chatRuntime = { id, tenantId: a.tenant.id, slug: a.input.slug, name: 'Helena', description: 'Atendimento CI',
      primaryColor: '#2563EB', style: 'welcoming', tenantName: a.tenant.name, tenantLogoUrl: null,
      knowledgeRevision: 2, knowledgeIndexId: prepared.id, pipelineId: a.pipeline.id,
      initialStageId: a.pipeline.stages[0].id, rotationId: null };
    const anonymous = getOrCreatePublicSessionToken(null).token;
    const realtimeRequest = { requestId: randomUUID() };
    const realtimeGateKey = `realtime-gate:${randomUUID()}`;
    await recordFlipAiCreditEntry({
      tenantId: a.tenant.id,
      idempotencyKey: realtimeGateKey,
      entryType: 'credit',
      amountCredits: 1,
      source: 'adjustment',
      referenceId: 'realtime-gate-ci',
    });
    let realtimeCalls = 0;
    const realtime = await issuePublicRealtimeSession(chatRuntime, anonymous, realtimeRequest, {}, async () => {
      realtimeCalls += 1;
      return {
        value: 'ek_ci_ephemeral_secret',
        expiresAt: Math.floor(Date.now() / 1_000) + 60,
        model: 'realtime-test',
        voice: 'marin',
        transcriptionModel: 'gpt-4o-mini-transcribe',
      };
    });
    assert.equal(realtime.clientSecret, 'ek_ci_ephemeral_secret');
    assert.equal(realtimeCalls, 1);
    const realtimeConversation = await prisma.conversation.findFirstOrThrow({
      where: { tenantId: a.tenant.id, provider: 'flip_ai', channel: 'web' },
    });
    assert.equal(await prisma.message.count({
      where: { tenantId: a.tenant.id, conversationId: realtimeConversation.id },
    }), 0, 'Realtime credential issuance must not create a fake message');
    await assert.rejects(
      issuePublicRealtimeSession(chatRuntime, anonymous, realtimeRequest, {}, async () => {
        realtimeCalls += 1;
        throw new Error('idempotent replay must not call OpenAI');
      }),
      (error: unknown) => error instanceof FlipAiError
        && error.code === 'REALTIME_SESSION_ALREADY_REQUESTED',
    );
    assert.equal(realtimeCalls, 1, 'the same Realtime request must never retry externally');
    assert.equal(await prisma.flipAiUsageEvent.count({
      where: { tenantId: a.tenant.id, operation: 'realtime_session', status: 'confirmed' },
    }), 1);
    await prisma.flipAiCreditLedgerEntry.deleteMany({
      where: { tenantId: a.tenant.id, idempotencyKey: realtimeGateKey },
    });
    await prisma.flipAiCreditAccount.deleteMany({
      where: { tenantId: a.tenant.id },
    });

    await prisma.flipAiUsageEvent.create({
      data: {
        tenantId: a.tenant.id,
        agentId: id,
        requestKey: `usage-definitive:${randomUUID()}`,
        operation: 'knowledge_embedding',
        provider: 'openai',
        model: 'embedding-test',
        status: 'definitive',
        outputTokens: 0,
      },
    });
    await prisma.flipAiUsageEvent.create({
      data: {
        tenantId: b.tenant.id,
        requestKey: `usage-isolation:${randomUUID()}`,
        operation: 'other_tenant_probe',
        provider: 'openai',
        model: 'other-tenant-model',
        status: 'confirmed',
        inputTokens: 900,
        outputTokens: 800,
      },
    });
    const usageA = await getFlipAiUsageDashboard(a.session, 30);
    const usageB = await getFlipAiUsageDashboard(b.session, 30);
    assert.equal(usageA.totals.realtimeSessions, 1);
    assert.equal(usageA.totals.failedOperations, 1,
      'definitive provider failures must be reported as failed');
    assert.equal(usageA.operations.some((operation) => operation.operation === 'other_tenant_probe'), false,
      'usage dashboard must not include another tenant');
    const tenantProbe = usageB.operations.find((operation) => operation.operation === 'other_tenant_probe');
    assert.equal(tenantProbe?.inputTokens, 900);
    assert.equal(tenantProbe?.outputTokens, 800);
    assert.equal(usageA.recent.some((event) => event.operation === 'realtime_session'), true);

    const walletKey = `top-up:ci:${randomUUID()}`;
    const [credited, creditedReplay] = await Promise.all([
      recordFlipAiCreditEntry({
        tenantId: a.tenant.id,
        idempotencyKey: walletKey,
        entryType: 'credit',
        amountCredits: 500,
        source: 'top_up',
        referenceId: 'payment-ci',
      }),
      recordFlipAiCreditEntry({
        tenantId: a.tenant.id,
        idempotencyKey: walletKey,
        entryType: 'credit',
        amountCredits: 500,
        source: 'top_up',
        referenceId: 'payment-ci',
      }),
    ]);
    assert.equal(credited.entryId, creditedReplay.entryId);
    assert.equal(credited.balanceCredits, 500);
    assert.equal([credited.reused, creditedReplay.reused].filter(Boolean).length, 1);
    assert.equal(await prisma.flipAiCreditLedgerEntry.count({
      where: { tenantId: a.tenant.id, idempotencyKey: walletKey },
    }), 1, 'idempotent concurrent credit must create one ledger row');
    await assert.rejects(recordFlipAiCreditEntry({
      tenantId: a.tenant.id,
      idempotencyKey: walletKey,
      entryType: 'credit',
      amountCredits: 501,
      source: 'top_up',
      referenceId: 'payment-ci',
    }), (error: unknown) => error instanceof FlipAiError
      && error.code === 'FLIP_AI_CREDIT_IDEMPOTENCY_CONFLICT');
    const debited = await recordFlipAiCreditEntry({
      tenantId: a.tenant.id,
      idempotencyKey: `usage:ci:${randomUUID()}`,
      entryType: 'debit',
      amountCredits: 125,
      source: 'usage',
      referenceId: 'usage-event-ci',
    });
    assert.equal(debited.balanceCredits, 375);
    await assert.rejects(recordFlipAiCreditEntry({
      tenantId: a.tenant.id,
      idempotencyKey: `usage:insufficient:${randomUUID()}`,
      entryType: 'debit',
      amountCredits: 376,
      source: 'usage',
    }), (error: unknown) => error instanceof FlipAiError
      && error.code === 'FLIP_AI_CREDIT_BALANCE_INSUFFICIENT');
    await recordFlipAiCreditEntry({
      tenantId: b.tenant.id,
      idempotencyKey: walletKey,
      entryType: 'credit',
      amountCredits: 50,
      source: 'top_up',
      referenceId: 'payment-other-tenant',
    });
    const walletA = await getFlipAiCreditWallet(a.session);
    const walletB = await getFlipAiCreditWallet(b.session);
    assert.equal(walletA.balanceCredits, 375);
    assert.equal(walletA.creditedCredits, 500);
    assert.equal(walletA.debitedCredits, 125);
    assert.equal(walletA.entries.length, 2);
    assert.equal(walletB.balanceCredits, 50);
    assert.equal(walletB.entries.length, 1);
    assert.equal(walletB.entries.some((entry) => entry.referenceId === 'usage-event-ci'), false,
      'wallet history must not include another tenant');

    const adminGrantKey = `ci-grant-${randomUUID()}`;
    const adminGrant = await grantFlipAiCreditsByPlatformAdmin({
      tenantId: a.tenant.id,
      amountCredits: 1_000,
      reason: 'Crédito administrativo de teste',
      idempotencyIdentifier: adminGrantKey,
      actorUserId: a.session.userId,
    });
    const adminGrantReplay = await grantFlipAiCreditsByPlatformAdmin({
      tenantId: a.tenant.id,
      amountCredits: 1_000,
      reason: 'Crédito administrativo de teste',
      idempotencyIdentifier: adminGrantKey,
      actorUserId: a.session.userId,
    });
    assert.equal(adminGrantReplay.entryId, adminGrant.entryId);
    assert.equal(adminGrantReplay.reused, true);
    assert.equal(await prisma.flipAiCreditLedgerEntry.count({
      where: { tenantId: a.tenant.id, idempotencyKey: `platform-admin:${adminGrantKey}` },
    }), 1, 'platform admin replay must never duplicate credit');
    assert.equal(await prisma.auditLog.count({
      where: {
        tenantId: a.tenant.id,
        entityType: 'flip_ai_credit_ledger',
        entityId: adminGrant.entryId,
        action: 'platform.flip_ai_credits_granted',
        userId: a.session.userId,
      },
    }), 1, 'admin credit grant must record one audit row with the actor');

    const walletAfterAdminGrantA = await getFlipAiCreditWalletForTenant(a.tenant.id);
    const walletAfterAdminGrantB = await getFlipAiCreditWalletForTenant(b.tenant.id);
    assert.equal(walletAfterAdminGrantA.balanceCredits, 1_375);
    assert.equal(walletAfterAdminGrantB.balanceCredits, 50,
      'credits granted to tenant A must never increase tenant B balance');

    await recordFlipAiCreditEntry({
      tenantId: a.tenant.id,
      idempotencyKey: `top-up:billing-ci:${randomUUID()}`,
      entryType: 'credit',
      amountCredits: 2_000,
      source: 'top_up',
      referenceId: 'payment-billing-ci',
    });
    const billableUsage = await prisma.flipAiUsageEvent.create({
      data: {
        tenantId: a.tenant.id,
        agentId: id,
        requestKey: `usage-billing-ci:${randomUUID()}`,
        operation: 'chat_response',
        provider: 'openai',
        model: 'gpt-5.6-luna',
        status: 'confirmed',
        inputTokens: 1_000,
        outputTokens: 500,
      },
    });
    const charged = await settleFlipAiUsageCharge({
      tenantId: a.tenant.id,
      eventId: billableUsage.id,
    });
    const chargedReplay = await settleFlipAiUsageCharge({
      tenantId: a.tenant.id,
      eventId: billableUsage.id,
    });
    assert.equal(charged.status, 'charged');
    assert.equal(charged.amountCredits, 800);
    assert.equal(chargedReplay.status, 'charged');
    assert.equal(chargedReplay.ledgerEntryId, charged.ledgerEntryId);
    assert.equal(chargedReplay.reused, true);
    assert.equal(await prisma.flipAiCreditLedgerEntry.count({
      where: { tenantId: a.tenant.id, idempotencyKey: `usage:${billableUsage.id}` },
    }), 1, 'one confirmed usage event must create one debit');

    const refund = await refundFlipAiUsageCharge({
      tenantId: a.tenant.id,
      eventId: billableUsage.id,
      reason: 'ci_reconciliation',
    });
    const refundReplay = await refundFlipAiUsageCharge({
      tenantId: a.tenant.id,
      eventId: billableUsage.id,
      reason: 'ci_reconciliation',
    });
    assert.equal(refund.amountCredits, 800);
    assert.equal(refundReplay.entryId, refund.entryId);
    assert.equal(refundReplay.reused, true);
    const settledAfterRefund = await settleFlipAiUsageCharge({ tenantId: a.tenant.id, eventId: billableUsage.id });
    assert.equal(settledAfterRefund.status, 'refunded');
    assert.equal(await prisma.flipAiCreditLedgerEntry.count({
      where: { tenantId: a.tenant.id, idempotencyKey: `usage-refund:${billableUsage.id}` },
    }), 1, 'refund must also be idempotent');

    const ambiguousUsage = await prisma.flipAiUsageEvent.create({
      data: {
        tenantId: a.tenant.id,
        agentId: id,
        requestKey: `usage-ambiguous-ci:${randomUUID()}`,
        operation: 'chat_response',
        provider: 'openai',
        model: 'gpt-5.6-luna',
        status: 'ambiguous',
        inputTokens: 2_000,
        outputTokens: 1_000,
      },
    });
    const ambiguousSettlement = await settleFlipAiUsageCharge({
      tenantId: a.tenant.id,
      eventId: ambiguousUsage.id,
    });
    assert.equal(ambiguousSettlement.status, 'not_billable');
    assert.equal(await prisma.flipAiCreditLedgerEntry.count({
      where: { tenantId: a.tenant.id, referenceId: ambiguousUsage.id },
    }), 0, 'ambiguous usage must never debit the wallet');

    const expensiveUsage = await prisma.flipAiUsageEvent.create({
      data: {
        tenantId: a.tenant.id,
        agentId: id,
        requestKey: `usage-insufficient-ci:${randomUUID()}`,
        operation: 'chat_response',
        provider: 'openai',
        model: 'gpt-5.6-luna',
        status: 'confirmed',
        inputTokens: 20_000_000,
        outputTokens: 0,
      },
    });
    const insufficient = await settleFlipAiUsageCharge({
      tenantId: a.tenant.id,
      eventId: expensiveUsage.id,
    });
    assert.equal(insufficient.status, 'insufficient_balance');
    assert.equal(await prisma.flipAiCreditLedgerEntry.count({
      where: { tenantId: a.tenant.id, referenceId: expensiveUsage.id },
    }), 0, 'insufficient balance must leave no debit row');

    const realtimeWindow = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    await prisma.flipAiRateLimitBucket.update({
      where: { tenantId_scope_scopeKey_windowStart: {
        tenantId: a.tenant.id,
        scope: 'realtime_agent',
        scopeKey: id,
        windowStart: realtimeWindow,
      } },
      data: { requestCount: 30 },
    });
    const conversationsBeforeRotatedCookie = await prisma.conversation.count({
      where: { tenantId: a.tenant.id },
    });
    await assert.rejects(issuePublicRealtimeSession(
      chatRuntime,
      getOrCreatePublicSessionToken(null).token,
      { requestId: randomUUID() },
      {},
      async () => { throw new Error('stable quota must reject before OpenAI'); },
    ), (error: unknown) => error instanceof FlipAiError
      && error.code === 'REALTIME_SESSION_RATE_LIMITED');
    assert.equal(await prisma.conversation.count({ where: { tenantId: a.tenant.id } }),
      conversationsBeforeRotatedCookie,
      'rotating the anonymous cookie must not create rows after the stable agent quota is exhausted');

    const entryAttribution = {
      utmSource: 'meta', utmMedium: 'paid-social', utmCampaign: 'salario-maternidade',
      utmContent: 'video-02', utmTerm: null, fbclid: null, gclid: null,
      landingPage: 'https://leads.example/chat/helena', referrer: null,
    };
    const chatInput = { messageId: randomUUID(), text: 'Quero entender o atendimento.',
      attribution: entryAttribution };
    const turn = await preparePublicChatTurn(chatRuntime, anonymous, chatInput);
    assert.equal(turn.mode, 'execute');
    if (turn.mode !== 'execute') throw new Error('expected executable chat turn');
    await completePublicChatTurn(turn, { responseId: 'resp_ci', model: 'test-model', text: 'Claro, me conte o que aconteceu.',
      inputTokens: 20, outputTokens: 8 });
    const replay = await preparePublicChatTurn(chatRuntime, anonymous, chatInput);
    assert.equal(replay.mode, 'replay');
    assert.equal(replay.mode === 'replay' ? replay.text : '', 'Claro, me conte o que aconteceu.');
    assert.equal(await prisma.flipAiUsageEvent.count({ where: { tenantId: a.tenant.id, requestKey: turn.requestKey } }), 1,
      'replaying the same chat turn must not create a second usage event');
    assert.equal(await prisma.conversation.count({ where: { tenantId: a.tenant.id, provider: 'flip_ai', channel: 'web' } }), 1);
    assert.equal(await prisma.flipAiConversationState.count({ where: { tenantId: a.tenant.id, agentId: id, turnCount: 1 } }), 1);

    const identityInput = { messageId: randomUUID(), text: 'Meu nome é Diego e meu telefone é (86) 99999-8877.' };
    const identityTurn = await preparePublicChatTurn(chatRuntime, anonymous, identityInput);
    assert.equal(identityTurn.mode, 'execute');
    if (identityTurn.mode !== 'execute') throw new Error('expected identity turn');
    assert.deepEqual(identityTurn.attribution, entryAttribution,
      'later turns must preserve the first acquisition context even when the browser omits it');
    await completePublicChatTurn(identityTurn, {
      responseId: 'resp_identity', model: 'test-model', text: 'Obrigado, Diego. Como posso continuar?',
      inputTokens: 24, outputTokens: 9,
    }, {
      reply: 'Obrigado, Diego. Como posso continuar?',
      identity: { name: 'Diego', phone: '(86) 99999-8877' },
      qualification: null,
      memoryPatch: { facts: [], pending: [] },
    });
    const identityReplay = await preparePublicChatTurn(chatRuntime, anonymous, identityInput);
    assert.equal(identityReplay.mode, 'replay');
    assert.deepEqual(identityReplay.mode === 'replay' ? identityReplay.identity : null,
      { name: 'Diego', phone: '(86) 99999-8877' });
    const captured = await captureFlipAiLead({
      runtime: chatRuntime,
      conversationId: identityTurn.conversationId,
      decision: { name: 'Diego', phone: '(86) 99999-8877' },
      attribution: { utmSource: 'meta', utmCampaign: 'ci', landingPage: 'https://leads.example/chat/helena' },
    });
    assert.ok(captured);
    const capturedLead = await prisma.lead.findFirstOrThrow({
      where: { tenantId: a.tenant.id, phone: '5586999998877' },
    });
    assert.equal(capturedLead.pipelineId, a.pipeline.id);
    assert.equal(capturedLead.stageId, a.pipeline.stages[0].id);
    assert.equal((await prisma.conversation.findFirstOrThrow({
      where: { tenantId: a.tenant.id, id: identityTurn.conversationId },
    })).leadId, capturedLead.id);
    assert.equal((await prisma.leadAttribution.findUniqueOrThrow({
      where: { leadId: capturedLead.id },
    })).utmCampaign, 'ci');
    assert.equal(await captureFlipAiLead({
      runtime: chatRuntime,
      conversationId: identityTurn.conversationId,
      decision: { name: 'Diego', phone: '5586999998877' },
      attribution: {},
    }), null, 'a linked conversation must not emit a second media action');
    assert.equal(await prisma.lead.count({ where: { tenantId: a.tenant.id, phone: '5586999998877' } }), 1);

    const evidenceMessageIds = (await prisma.message.findMany({
      where: { tenantId: a.tenant.id, conversationId: identityTurn.conversationId, type: 'text' },
      select: { id: true },
    })).map((message) => message.id);
    const finalDecision = {
      classification: 'qualified' as const,
      fitScore: 88,
      intentScore: 81,
      awarenessLevel: 4,
      journeyStage: 'decision' as const,
      confidence: 0.93,
      summary: 'Lead aderente, consciente do problema e pronto para atendimento.',
      reasons: ['Atende aos critérios internos.', 'Demonstrou intenção de avançar no curto prazo.'],
      nextAction: 'Atendimento humano deve validar disponibilidade e próximos passos.',
    };
    const finalized = await finalizeFlipAiQualification({
      runtime: chatRuntime,
      conversationId: identityTurn.conversationId,
      decision: finalDecision,
      model: 'test-model',
      evidenceMessageIds,
    });
    assert.equal(finalized?.classification, 'qualified');
    assert.equal((await prisma.flipAiQualification.findFirstOrThrow({
      where: { tenantId: a.tenant.id, conversationId: identityTurn.conversationId },
    })).leadId, capturedLead.id);
    await finalizeFlipAiQualification({
      runtime: chatRuntime,
      conversationId: identityTurn.conversationId,
      decision: { ...finalDecision, fitScore: 1 },
      model: 'different-model',
      evidenceMessageIds,
    });
    assert.equal(await prisma.flipAiQualification.count({
      where: { tenantId: a.tenant.id, conversationId: identityTurn.conversationId },
    }), 1, 'one conversation must never emit a second final qualification');
    const qualifiedRow = await prisma.flipAiQualification.findFirstOrThrow({
      where: { tenantId: a.tenant.id, conversationId: identityTurn.conversationId },
    });
    assert.equal(qualifiedRow.fitScore, 88, 'replay must preserve the first server-accepted merit decision');
    assert.equal(qualifiedRow.qualifiedLeadEventId, `flip-ai-qualified:${identityTurn.conversationId}`);
    assert.equal(qualifiedRow.qualifiedLeadTrackingStatus, 'skipped',
      'without an enabled Meta integration the action is durably skipped, never retried blindly');
    await prisma.flipAiQualification.update({
      where: { id: qualifiedRow.id },
      data: { qualifiedLeadTrackingStatus: 'processing', updatedAt: new Date(0) },
    });
    await finalizeFlipAiQualification({
      runtime: chatRuntime,
      conversationId: identityTurn.conversationId,
      decision: finalDecision,
      model: 'test-model',
      evidenceMessageIds,
    });
    assert.equal((await prisma.flipAiQualification.findUniqueOrThrow({
      where: { id: qualifiedRow.id },
    })).qualifiedLeadTrackingStatus, 'ambiguous',
    'an abandoned processing claim must close without retrying an unknown external outcome');

    const chatState = await prisma.flipAiConversationState.findFirstOrThrow({
      where: { tenantId: a.tenant.id, agentId: id },
      select: { conversationId: true },
    });
    const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    await prisma.flipAiRateLimitBucket.upsert({
      where: { tenantId_scope_scopeKey_windowStart: {
        tenantId: a.tenant.id,
        scope: 'conversation',
        scopeKey: chatState.conversationId,
        windowStart,
      } },
      create: {
        tenantId: a.tenant.id,
        scope: 'conversation',
        scopeKey: chatState.conversationId,
        windowStart,
        requestCount: 11,
      },
      update: { requestCount: 11 },
    });
    const concurrentQuota = await Promise.allSettled([
      preparePublicChatTurn(chatRuntime, anonymous, {
        messageId: randomUUID(), text: 'Primeira mensagem concorrente.',
      }),
      preparePublicChatTurn(chatRuntime, anonymous, {
        messageId: randomUUID(), text: 'Segunda mensagem concorrente.',
      }),
    ]);
    assert.equal(concurrentQuota.filter((result) => result.status === 'fulfilled').length, 1,
      'atomic quota must reserve only one remaining slot');
    assert.equal(concurrentQuota.filter((result) =>
      result.status === 'rejected' && result.reason instanceof FlipAiError &&
      result.reason.code === 'CHAT_RATE_LIMITED').length, 1);

    const audit = await prisma.auditLog.findFirst({ where: { tenantId: a.tenant.id, action: 'master_markdown.revision_created' } });
    assert.equal(JSON.stringify(audit?.metadata).includes(master.content), false, 'knowledge content must not leak into audit metadata');

    const leadsBeforeUnpublish = await prisma.lead.count({ where: { tenantId: a.tenant.id } });
    const conversationsBeforeUnpublish = await prisma.conversation.count({ where: { tenantId: a.tenant.id } });
    const unpublished = await changeAgentPublication(a.session, id, {
      action: 'unpublish', version: editedPublished.version,
    }, { openAiConfigured: true });
    assert.equal(unpublished.status, 'draft');
    assert.equal((await changeAgentPublication(a.session, id, {
      action: 'unpublish', version: published.version,
    }, { openAiConfigured: true })).reused, true, 'unpublication replay must be idempotent');
    assert.equal(await prisma.auditLog.count({
      where: { tenantId: a.tenant.id, entityId: id, action: 'unpublished' },
    }), 1);
    assert.equal(await prisma.lead.count({ where: { tenantId: a.tenant.id } }), leadsBeforeUnpublish,
      'unpublishing must not delete leads');
    assert.equal(await prisma.conversation.count({ where: { tenantId: a.tenant.id } }), conversationsBeforeUnpublish,
      'unpublishing must not delete conversations');

    await prisma.tenantUser.update({ where: { tenantId_userId: { tenantId: a.tenant.id, userId: a.user.id } }, data: { status: 'inactive' } });
    await assert.rejects(getAgentDraftWorkspace(a.session), (e: unknown) => e instanceof FlipAiError && e.status === 403);
    assert.equal(await prisma.lead.count(), leads + 1);
  } finally { await cleanup(a); await cleanup(b); await prisma.$disconnect(); }
});
