import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import type { GoogleConversionSendOutcome, GoogleFunnelTransportConfig } from '../lib/tracking/google-data-manager';
import { createGoogleFunnelMapping } from '../lib/tracking/google-funnel-mappings';
import { enqueueGoogleConversionEvents } from '../lib/tracking/google-funnel-outbox';
import { processGoogleConversionOutbox } from '../lib/tracking/google-funnel-processor';

const CUSTOMER_ID = '1234567890';

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

async function fixture(options: { gclid?: string | null; customerId?: string } = {}) {
  const suffix = randomUUID();
  const plan = await getPremiumPlanForFixture();
  const tenant = await prisma.tenant.create({
    data: { name: 'Google Processor CI', slug: 'google-processor-ci-' + suffix, planId: plan.id, status: 'active' },
  });
  const pipeline = await prisma.pipeline.create({
    data: {
      tenantId: tenant.id,
      name: 'Funil CI',
      stages: { create: [{ name: 'Novo lead', orderIndex: 0 }, { name: 'Qualificado', orderIndex: 1 }] },
    },
    include: { stages: { orderBy: { orderIndex: 'asc' } } },
  });
  const stage = pipeline.stages[1];
  const lead = await prisma.lead.create({
    data: { tenantId: tenant.id, pipelineId: pipeline.id, stageId: stage.id, name: 'Lead CI', email: 'lead@example.invalid', phone: '86999991234' },
  });
  const gclid = options.gclid === undefined ? 'Cj0KCQ_ci-' + suffix.slice(0, 8) : options.gclid;
  if (gclid) await prisma.leadAttribution.create({ data: { tenantId: tenant.id, leadId: lead.id, gclid } });

  const mapping = await createGoogleFunnelMapping({
    tenantId: tenant.id,
    userId: 'ci-user',
    body: {
      pipelineId: pipeline.id,
      stageId: stage.id,
      conversionActionResource: `customers/${options.customerId || CUSTOMER_ID}/conversionActions/111`,
      conversionCategory: 'qualified_lead',
      enabled: true,
    },
  });
  assert.equal(mapping.ok, true);
  const queued = await enqueueGoogleConversionEvents({
    tenantId: tenant.id,
    leadId: lead.id,
    pipelineId: pipeline.id,
    stageId: stage.id,
    transitionId: randomUUID(),
    occurredAt: new Date(),
    triggeredById: 'ci-user',
  });
  assert.deepEqual(queued.map((item) => item.status), ['queued']);
  return { tenant, lead, gclid };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function cleanup(x: Fixture) {
  await prisma.googleConversionEvent.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.googleConversionMapping.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.leadAttribution.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.lead.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.pipeline.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.tenant.delete({ where: { id: x.tenant.id } });
}

function configFor(x: Fixture, overrides: Partial<GoogleFunnelTransportConfig> = {}): GoogleFunnelTransportConfig {
  return {
    enabled: true,
    validateOnly: false,
    sendUserData: false,
    loginAccountId: null,
    serviceAccount: { clientEmail: 'ci@example.iam.gserviceaccount.com', privateKey: 'unused' },
    tenantAccounts: new Map([[x.tenant.id, new Set([CUSTOMER_ID])]]),
    ...overrides,
  };
}

function fakeTransport(outcome: GoogleConversionSendOutcome) {
  const bodies: Array<Record<string, unknown>> = [];
  return {
    bodies,
    options: {
      getAccessToken: async () => 'ci-token',
      send: async (body: Record<string, unknown>) => {
        bodies.push(body);
        return outcome;
      },
    },
  };
}

function eventOf(x: Fixture) {
  return prisma.googleConversionEvent.findFirstOrThrow({ where: { tenantId: x.tenant.id } });
}

test('transporte desligado ou sem credencial não lê nem altera a fila', async () => {
  assertDisposableDatabase();
  const x = await fixture();
  try {
    const transport = fakeTransport({ outcome: 'sent', requestId: 'r' });
    const disabled = await processGoogleConversionOutbox({ ...transport.options, config: configFor(x, { enabled: false }) });
    assert.equal(disabled.status, 'transport_disabled');
    const noCredentials = await processGoogleConversionOutbox({ ...transport.options, config: configFor(x, { serviceAccount: null }) });
    assert.equal(noCredentials.status, 'credentials_missing');
    const unpaired = await processGoogleConversionOutbox({ ...transport.options, config: configFor(x, { tenantAccounts: new Map() }) });
    assert.equal(unpaired.status, 'no_paired_tenant');
    assert.equal(transport.bodies.length, 0);
    const event = await eventOf(x);
    assert.equal(event.state, 'PENDING');
    assert.equal(event.attempts, 0);
  } finally {
    await cleanup(x);
  }
});

test('envia uma única vez e só para o tenant pareado', async () => {
  assertDisposableDatabase();
  const x = await fixture();
  const other = await fixture();
  try {
    const transport = fakeTransport({ outcome: 'sent', requestId: 'req-1' });
    const [a, b] = await Promise.all([
      processGoogleConversionOutbox({ ...transport.options, config: configFor(x) }),
      processGoogleConversionOutbox({ ...transport.options, config: configFor(x) }),
    ]);
    assert.equal(a.sent + b.sent, 1);
    assert.equal(transport.bodies.length, 1);
    const again = await processGoogleConversionOutbox({ ...transport.options, config: configFor(x) });
    assert.equal(again.claimed, 0);
    assert.equal(transport.bodies.length, 1);

    const event = await eventOf(x);
    assert.equal(event.state, 'SENT');
    assert.equal(event.attempts, 1);
    assert.equal(event.lastErrorCode, null);
    assert.equal(event.nextAttemptAt, null);

    const sentEvent = (transport.bodies[0].events as Array<Record<string, any>>)[0];
    assert.equal(sentEvent.transactionId, event.idempotencyKey);
    assert.deepEqual(sentEvent.adIdentifiers, { gclid: x.gclid });
    assert.equal('userData' in sentEvent, false);
    const serialized = JSON.stringify(transport.bodies[0]);
    assert.equal(serialized.includes('lead@example.invalid'), false);
    assert.equal(serialized.includes('86999991234'), false);

    // The other tenant is not paired: its queue is never touched.
    const untouched = await eventOf(other);
    assert.equal(untouched.state, 'PENDING');
    assert.equal(untouched.attempts, 0);
    // Attribution is read-only for the processor.
    const attribution = await prisma.leadAttribution.findUniqueOrThrow({ where: { leadId: x.lead.id } });
    assert.equal(attribution.gclid, x.gclid);
  } finally {
    await cleanup(x);
    await cleanup(other);
  }
});

test('evento sem identificador ou para conta não pareada falha sem chamar o Google', async () => {
  assertDisposableDatabase();
  const noClick = await fixture({ gclid: null });
  const foreignAccount = await fixture({ customerId: '9999999999' });
  try {
    const transport = fakeTransport({ outcome: 'sent', requestId: 'r' });
    const first = await processGoogleConversionOutbox({ ...transport.options, config: configFor(noClick) });
    assert.equal(first.failed, 1);
    const second = await processGoogleConversionOutbox({ ...transport.options, config: configFor(foreignAccount) });
    assert.equal(second.failed, 1);
    assert.equal(transport.bodies.length, 0);
    assert.equal((await eventOf(noClick)).lastErrorCode, 'NO_IDENTIFIER');
    assert.equal((await eventOf(noClick)).state, 'FAILED');
    assert.equal((await eventOf(foreignAccount)).lastErrorCode, 'TENANT_ACCOUNT_NOT_ALLOWED');
    assert.equal((await eventOf(foreignAccount)).state, 'FAILED');
  } finally {
    await cleanup(noClick);
    await cleanup(foreignAccount);
  }
});

test('falha temporária agenda nova tentativa e depois envia', async () => {
  assertDisposableDatabase();
  const x = await fixture();
  try {
    const now = new Date();
    const failing = fakeTransport({ outcome: 'retry', code: 'UNAVAILABLE' });
    const first = await processGoogleConversionOutbox({ ...failing.options, config: configFor(x), now });
    assert.equal(first.retried, 1);
    let event = await eventOf(x);
    assert.equal(event.state, 'RETRY');
    assert.equal(event.attempts, 1);
    assert.equal(event.lastErrorCode, 'UNAVAILABLE');
    assert.equal(event.nextAttemptAt?.getTime(), now.getTime() + 60_000);

    const notDue = await processGoogleConversionOutbox({ ...failing.options, config: configFor(x), now });
    assert.equal(notDue.claimed, 0);

    const working = fakeTransport({ outcome: 'sent', requestId: 'r' });
    const later = await processGoogleConversionOutbox({ ...working.options, config: configFor(x), now: new Date(now.getTime() + 61_000) });
    assert.equal(later.sent, 1);
    event = await eventOf(x);
    assert.equal(event.state, 'SENT');
    assert.equal(event.attempts, 2);
    assert.equal(working.bodies.length, 1);
  } finally {
    await cleanup(x);
  }
});

test('dry run valida sem consumir o evento e rejeição é final', async () => {
  assertDisposableDatabase();
  const dryRun = await fixture();
  const rejected = await fixture();
  try {
    const now = new Date();
    const validating = fakeTransport({ outcome: 'validated' });
    const summary = await processGoogleConversionOutbox({ ...validating.options, config: configFor(dryRun, { validateOnly: true }), now });
    assert.equal(summary.validated, 1);
    assert.equal(validating.bodies[0].validateOnly, true);
    const pending = await eventOf(dryRun);
    assert.equal(pending.state, 'PENDING');
    assert.equal(pending.attempts, 0);
    assert.equal(pending.lastErrorCode, 'DRY_RUN_VALIDATED');
    assert.ok(pending.nextAttemptAt && pending.nextAttemptAt.getTime() > now.getTime());

    const rejecting = fakeTransport({ outcome: 'rejected', code: 'INVALID_ARGUMENT' });
    const rejectedSummary = await processGoogleConversionOutbox({ ...rejecting.options, config: configFor(rejected), now });
    assert.equal(rejectedSummary.rejected, 1);
    const final = await eventOf(rejected);
    assert.equal(final.state, 'REJECTED');
    assert.equal(final.lastErrorCode, 'INVALID_ARGUMENT');
    assert.ok(final.finalizedAt);
    const after = await processGoogleConversionOutbox({ ...rejecting.options, config: configFor(rejected), now: new Date(now.getTime() + 86_400_000) });
    assert.equal(after.claimed, 0);
  } finally {
    await cleanup(dryRun);
    await cleanup(rejected);
  }
});
