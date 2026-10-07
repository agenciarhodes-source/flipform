import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import {
  archiveGoogleFunnelMapping,
  createGoogleFunnelMapping,
  listGoogleFunnelMappings,
} from '../lib/tracking/google-funnel-mappings';
import { enqueueGoogleConversionEvents } from '../lib/tracking/google-funnel-outbox';

function assertDisposableDatabase() {
  const url = new URL(process.env.DATABASE_URL || 'https://invalid');
  if (process.env.CI !== 'true' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/flipform_ci') {
    throw new Error('Google funnel fixtures require CI=true and local disposable flipform_ci database.');
  }
}

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
  const tenant = await prisma.tenant.create({
    data: { name: 'Google Funnel CI', slug: 'google-funnel-ci-' + suffix, planId: plan.id, status: 'active' },
  });
  const pipeline = await prisma.pipeline.create({
    data: {
      tenantId: tenant.id,
      name: 'Funil CI',
      stages: { create: [{ name: 'Novo lead', orderIndex: 0 }, { name: 'Qualificado', orderIndex: 1 }] },
    },
    include: { stages: { orderBy: { orderIndex: 'asc' } } },
  });
  const lead = await prisma.lead.create({
    data: { tenantId: tenant.id, pipelineId: pipeline.id, stageId: pipeline.stages[0].id, name: 'Lead CI' },
  });
  return { tenant, pipeline, lead, qualifiedStage: pipeline.stages[1] };
}

async function cleanup(x: Awaited<ReturnType<typeof fixture>>) {
  await prisma.googleConversionEvent.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.googleConversionMapping.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.leadPurchase.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.lead.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.pipeline.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.tenant.delete({ where: { id: x.tenant.id } });
}

function mappingBody(x: Awaited<ReturnType<typeof fixture>>, overrides: Record<string, unknown> = {}) {
  return {
    pipelineId: x.pipeline.id,
    stageId: x.qualifiedStage.id,
    conversionActionResource: 'customers/1234567890/conversionActions/111',
    conversionCategory: 'qualified_lead',
    enabled: true,
    ...overrides,
  };
}

function transition(x: Awaited<ReturnType<typeof fixture>>, transitionId = randomUUID()) {
  return {
    tenantId: x.tenant.id,
    leadId: x.lead.id,
    pipelineId: x.pipeline.id,
    stageId: x.qualifiedStage.id,
    transitionId,
    occurredAt: new Date(),
    triggeredById: 'ci-user',
  };
}

test('etapa sem mapeamento ativo não gera evento', async () => {
  assertDisposableDatabase();
  const x = await fixture();
  try {
    assert.deepEqual(await enqueueGoogleConversionEvents(transition(x)), []);
    const created = await createGoogleFunnelMapping({ tenantId: x.tenant.id, userId: 'ci-user', body: mappingBody(x, { enabled: false }) });
    assert.equal(created.ok, true);
    assert.deepEqual(await enqueueGoogleConversionEvents(transition(x)), []);
    assert.equal(await prisma.googleConversionEvent.count({ where: { tenantId: x.tenant.id } }), 0);
  } finally {
    await cleanup(x);
  }
});

test('first_entry sinaliza o lead uma única vez por etapa', async () => {
  assertDisposableDatabase();
  const x = await fixture();
  try {
    const created = await createGoogleFunnelMapping({ tenantId: x.tenant.id, userId: 'ci-user', body: mappingBody(x) });
    assert.equal(created.ok, true);
    const first = await enqueueGoogleConversionEvents(transition(x));
    assert.deepEqual(first.map((item) => item.status), ['queued']);
    const reentry = await enqueueGoogleConversionEvents(transition(x));
    assert.deepEqual(reentry.map((item) => item.status), ['already_signaled']);

    const events = await prisma.googleConversionEvent.findMany({ where: { tenantId: x.tenant.id } });
    assert.equal(events.length, 1);
    assert.equal(events[0].state, 'PENDING');
    assert.equal(events[0].attempts, 0);
    assert.equal(events[0].conversionValue, null);
    assert.equal(events[0].currency, null);
    assert.equal(events[0].conversionActionResource, 'customers/1234567890/conversionActions/111');
    assert.match(events[0].idempotencyKey, /^gads:[0-9a-f]{64}$/);
  } finally {
    await cleanup(x);
  }
});

test('every_entry não duplica a mesma transição', async () => {
  assertDisposableDatabase();
  const x = await fixture();
  try {
    const created = await createGoogleFunnelMapping({
      tenantId: x.tenant.id,
      userId: 'ci-user',
      body: mappingBody(x, { triggerRule: 'every_entry', valueMode: 'fixed', conversionValue: 100 }),
    });
    assert.equal(created.ok, true);
    const sameTransition = randomUUID();
    const [a, b] = await Promise.all([
      enqueueGoogleConversionEvents(transition(x, sameTransition)),
      enqueueGoogleConversionEvents(transition(x, sameTransition)),
    ]);
    assert.deepEqual([a[0].status, b[0].status].sort(), ['duplicate', 'queued']);
    const retry = await enqueueGoogleConversionEvents(transition(x, sameTransition));
    assert.deepEqual(retry.map((item) => item.status), ['duplicate']);
    const next = await enqueueGoogleConversionEvents(transition(x));
    assert.deepEqual(next.map((item) => item.status), ['queued']);

    const events = await prisma.googleConversionEvent.findMany({ where: { tenantId: x.tenant.id } });
    assert.equal(events.length, 2);
    for (const event of events) {
      assert.equal(Number(event.conversionValue), 100);
      assert.equal(event.currency, 'BRL');
    }
  } finally {
    await cleanup(x);
  }
});

test('modo purchase aguarda uma compra explícita e nunca inventa receita', async () => {
  assertDisposableDatabase();
  const x = await fixture();
  try {
    const created = await createGoogleFunnelMapping({
      tenantId: x.tenant.id,
      userId: 'ci-user',
      body: mappingBody(x, { conversionCategory: 'converted_lead', valueMode: 'purchase' }),
    });
    assert.equal(created.ok, true);
    const waiting = await enqueueGoogleConversionEvents(transition(x));
    assert.deepEqual(waiting.map((item) => item.status), ['awaiting_purchase']);
    assert.equal(await prisma.googleConversionEvent.count({ where: { tenantId: x.tenant.id } }), 0);

    await prisma.leadPurchase.create({
      data: { tenantId: x.tenant.id, leadId: x.lead.id, amountCents: 500000, purchaseDate: new Date() },
    });
    const queued = await enqueueGoogleConversionEvents(transition(x));
    assert.deepEqual(queued.map((item) => item.status), ['queued']);
    const event = await prisma.googleConversionEvent.findFirstOrThrow({ where: { tenantId: x.tenant.id } });
    assert.equal(Number(event.conversionValue), 5000);
    assert.equal(event.currency, 'BRL');
  } finally {
    await cleanup(x);
  }
});

test('mapeamentos e eventos são isolados por tenant', async () => {
  assertDisposableDatabase();
  const x = await fixture();
  const other = await fixture();
  try {
    const created = await createGoogleFunnelMapping({ tenantId: x.tenant.id, userId: 'ci-user', body: mappingBody(x) });
    assert.equal(created.ok, true);

    const foreignStage = await createGoogleFunnelMapping({ tenantId: other.tenant.id, userId: 'ci-user', body: mappingBody(x) });
    assert.deepEqual(foreignStage, { ok: false, status: 400, error: 'Etapa inválida para este tenant.' });
    assert.deepEqual(await listGoogleFunnelMappings(other.tenant.id), []);

    const crossTenant = await enqueueGoogleConversionEvents({ ...transition(x), tenantId: other.tenant.id });
    assert.deepEqual(crossTenant, []);
    assert.equal(await prisma.googleConversionEvent.count({ where: { tenantId: other.tenant.id } }), 0);
  } finally {
    await cleanup(x);
    await cleanup(other);
  }
});

test('mapeamento duplicado é recusado e o arquivado é restaurado com o histórico', async () => {
  assertDisposableDatabase();
  const x = await fixture();
  try {
    const created = await createGoogleFunnelMapping({ tenantId: x.tenant.id, userId: 'ci-user', body: mappingBody(x) });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const duplicate = await createGoogleFunnelMapping({ tenantId: x.tenant.id, userId: 'ci-user', body: mappingBody(x) });
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) assert.equal(duplicate.status, 409);

    await enqueueGoogleConversionEvents(transition(x));
    assert.deepEqual(await archiveGoogleFunnelMapping({ tenantId: x.tenant.id, userId: 'ci-user', mappingId: created.mapping.id }), { ok: true });
    assert.deepEqual(await listGoogleFunnelMappings(x.tenant.id), []);
    // Archived mappings stop signaling, and their past events remain.
    assert.deepEqual(await enqueueGoogleConversionEvents(transition(x)), []);
    assert.equal(await prisma.googleConversionEvent.count({ where: { tenantId: x.tenant.id } }), 1);

    const restored = await createGoogleFunnelMapping({ tenantId: x.tenant.id, userId: 'ci-user', body: mappingBody(x, { enabled: false }) });
    assert.equal(restored.ok, true);
    if (restored.ok) {
      assert.equal(restored.mapping.id, created.mapping.id);
      assert.equal(restored.mapping.enabled, false);
    }
  } finally {
    await cleanup(x);
  }
});
