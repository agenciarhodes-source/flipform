import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { localFixtureAllowed } from '../lib/universal-connectors/sync-fixture-policy';
import { enqueueFixtureSync, processFixturePage, fixtureDataSnapshot, fixtureSyncHistory } from '../lib/universal-connectors/sync-fixture-service';

test('PR-C local PostgreSQL: cursor, idempotency, isolation and provenance', { skip: !localFixtureAllowed() }, async () => {
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const tenants: string[] = [];
  try {
    for (const label of ['a','b']) {
      const t = await db.tenant.create({ data: { name: 'Synthetic ' + label, slug: 'uc-sync-' + randomUUID() } });
      tenants.push(t.id);
    }
    const [a,b] = tenants;
    const c = await db.universalConnection.create({ data: { tenantId: a, providerId: 'synthetic_finance', authMethod: 'api_key', enabled: false } });
    const scope = { tenantId: a, connectionId: c.id }, wrong = { tenantId: b, connectionId: c.id };
    const run = await enqueueFixtureSync(scope, 'request-01');
    assert.equal((await enqueueFixtureSync(scope, 'request-01')).id, run.id);
    await assert.rejects(enqueueFixtureSync(wrong, 'request-01'));
    await assert.rejects(processFixturePage(wrong, run.id));
    await assert.rejects(fixtureDataSnapshot(wrong));
    const first = await processFixturePage(scope, run.id);
    assert.equal(first.nextPage, 1); assert.equal(first.status, 'queued');
    const last = await processFixturePage(scope, run.id);
    assert.equal(last.status, 'succeeded'); assert.equal(last.processed, 4);
    assert.equal((await processFixturePage(scope, run.id)).processed, 4);
    const records = await fixtureDataSnapshot(scope);
    assert.equal(records.length, 2);
    assert.equal(records[0].status, 'paid');
    assert.equal(records[0].runId, run.id);
    assert.equal(records[0].providerId, 'synthetic_finance');
    const second = await enqueueFixtureSync(scope, 'request-02');
    await processFixturePage(scope, second.id); await processFixturePage(scope, second.id);
    assert.equal((await fixtureDataSnapshot(scope)).length, 2);
    assert.equal((await fixtureDataSnapshot(scope))[0].status, 'paid');
    assert.equal((await fixtureSyncHistory(scope)).length, 2);
    await assert.rejects(db.universalSyncRun.create({ data: { ...wrong, requestKey: 'invalid', fixtureVersion: 'finance-v1' } }));
    await assert.rejects(db.universalDataRecord.create({ data: { ...wrong, runId: run.id, providerId: 'synthetic_finance', kind: 'receivable', sourceId: 'fixture-c', sourceUpdatedAt: new Date(), amountMinor: 1, currency: 'BRL', status: 'open' } }));
  } finally {
    await db.universalDataRecord.deleteMany({ where: { tenantId: { in: tenants } } });
    await db.universalSyncRun.deleteMany({ where: { tenantId: { in: tenants } } });
    await db.universalConnection.deleteMany({ where: { tenantId: { in: tenants } } });
    await db.tenant.deleteMany({ where: { id: { in: tenants } } });
    await db.$disconnect();
  }
});
