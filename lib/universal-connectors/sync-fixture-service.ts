import 'server-only';
import { Prisma, PrismaClient } from '@prisma/client';
import { localFixtureAllowed, FIXTURE_VERSION, SYNTHETIC_PROVIDER, fixturePage, requestDigest, decideRevision, retryState } from './sync-fixture-policy';

type Scope = Readonly<{ tenantId: string; connectionId: string }>;
const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

/** No routes, jobs, remote DB, credentials or real provider calls. Explicit local harness only. */
async function local<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  if (!localFixtureAllowed()) throw new Error('SYNTHETIC_SYNC_DISABLED');
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  try { return await fn(db); } finally { await db.$disconnect(); }
}
async function assertConnection(tx: Prisma.TransactionClient, scope: Scope) {
  const c = await tx.universalConnection.findFirst({ where: {
    tenantId: scope.tenantId, id: scope.connectionId, providerId: SYNTHETIC_PROVIDER,
    enabled: false, revokedAt: null, tenant: { status: 'active' }, credential: { is: null },
  }, select: { id: true } });
  if (!c) throw new Error('SYNTHETIC_CONNECTION_REQUIRED');
}
export async function enqueueFixtureSync(scope: Scope, key: string) {
  const requestKey = requestDigest(key);
  return local(db => db.$transaction(async tx => {
    await assertConnection(tx, scope);
    return tx.universalSyncRun.upsert({
      where: { tenantId_connectionId_requestKey: { ...scope, requestKey } },
      create: { ...scope, requestKey, fixtureVersion: FIXTURE_VERSION }, update: {},
    });
  }, serializable));
}

/** Process one deterministic page atomically. Serializes on the run row; no long lease or
 * network transaction. A failed transaction cannot advance a cursor or partially save rows. */
export async function processFixturePage(scope: Scope, runId: string) {
  return local(async db => {
    let snapshot: { nextPage: number; attempts: number } | null = null;
    try {
      return await db.$transaction(async tx => {
        await assertConnection(tx, scope);
        const lock = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM universal_sync_runs WHERE tenant_id = ${scope.tenantId}
          AND connection_id = ${scope.connectionId} AND id = ${runId} FOR UPDATE`;
        if (!lock.length) throw new Error('SYNC_NOT_FOUND');
        const run = await tx.universalSyncRun.findFirstOrThrow({ where: { ...scope, id: runId } });
        if (run.status !== 'queued') return run;
        if (run.fixtureVersion !== FIXTURE_VERSION) throw new Error('FIXTURE_VERSION_MISMATCH');
        snapshot = { nextPage: run.nextPage, attempts: run.attempts };
        const page = fixturePage(run.nextPage);
        for (const record of page.records) {
          const key = { ...scope, kind: record.kind, sourceId: record.sourceId };
          const existing = await tx.universalDataRecord.findUnique({ where: { tenantId_connectionId_kind_sourceId: key } });
          const decision = decideRevision(existing ? { sourceUpdatedAt: existing.sourceUpdatedAt, amountMinor: existing.amountMinor,
            currency: 'BRL', status: existing.status as 'open' | 'paid' } : null, record);
          if (decision === 'conflict') throw new Error('REVISION_CONFLICT');
          if (decision === 'skip') continue;
          const data = { runId, providerId: SYNTHETIC_PROVIDER, sourceUpdatedAt: record.sourceUpdatedAt,
            amountMinor: record.amountMinor, currency: record.currency, status: record.status, observedAt: new Date() };
          if (decision === 'insert') await tx.universalDataRecord.create({ data: { ...key, ...data } });
          else await tx.universalDataRecord.update({ where: { tenantId_connectionId_kind_sourceId: key }, data });
        }
        const updated = await tx.universalSyncRun.updateMany({ where: { ...scope, id: runId, status: 'queued', nextPage: run.nextPage, attempts: run.attempts },
          data: { nextPage: { increment: 1 }, processed: { increment: page.records.length }, attempts: 0, errorCode: null,
            status: page.done ? 'succeeded' : 'queued', finishedAt: page.done ? new Date() : null } });
        if (updated.count !== 1) throw new Error('SYNC_CONFLICT');
        return tx.universalSyncRun.findFirstOrThrow({ where: { ...scope, id: runId } });
      }, serializable);
    } catch {
      // Failure metadata is bounded and redacted. Do not charge a different page after a race.
      const failed = snapshot as { nextPage: number; attempts: number } | null;
      if (!failed) throw new Error('SYNTHETIC_SYNC_UNAVAILABLE');
      await db.$transaction(async tx => {
        await assertConnection(tx, scope);
        const attempts = failed.attempts + 1;
        const status = retryState(attempts);
        await tx.universalSyncRun.updateMany({ where: { ...scope, id: runId, status: 'queued', ...failed },
          data: { attempts, status, errorCode: 'PAGE_FAILED', finishedAt: status === 'failed' ? new Date() : null } });
      }, serializable);
      throw new Error('SYNTHETIC_PAGE_FAILED');
    }
  });
}

/** Scoped local diagnostic history; never feeds Flip Intelligence until real data is homologated. */
export async function fixtureSyncHistory(scope: Scope) {
  return local(db => db.$transaction(async tx => {
    await assertConnection(tx, scope);
    return tx.universalSyncRun.findMany({ where: scope, orderBy: { createdAt: 'desc' }, take: 50 });
  }, serializable));
}
export async function fixtureDataSnapshot(scope: Scope) {
  return local(db => db.$transaction(async tx => {
    await assertConnection(tx, scope);
    return tx.universalDataRecord.findMany({ where: scope, orderBy: { sourceId: 'asc' }, take: 100 });
  }, serializable));
}
