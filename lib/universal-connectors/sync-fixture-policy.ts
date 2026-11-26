import { createHash } from 'node:crypto';

export const FIXTURE_VERSION = 'finance-v1';
export const SYNTHETIC_PROVIDER = 'synthetic_finance';
export const MAX_ATTEMPTS = 3;

export function localFixtureAllowed(env: Readonly<Record<string,string|undefined>> = process.env): boolean {
  if (env.NODE_ENV !== 'test' || env.UNIVERSAL_SYNC_FIXTURE_ENABLED !== 'true' || env.VERCEL || env.VERCEL_ENV) return false;
  try {
    const u = new URL(env.DATABASE_URL ?? '');
    return ['postgresql:', 'postgres:'].includes(u.protocol) && u.hostname === '127.0.0.1'
      && u.port === '5432' && u.pathname === '/flipform_ci' && u.username === 'postgres'
      && [...u.searchParams.keys()].every(k => k === 'schema') && (!u.searchParams.has('schema') || u.searchParams.get('schema') === 'public');
  } catch { return false; }
}

export type FinanceProjection = Readonly<{
  kind: 'receivable'; sourceId: string; sourceUpdatedAt: Date;
  amountMinor: number; currency: 'BRL'; status: 'open' | 'paid';
}>;

/** Strict allowlisted projection, no generic fields/PII/raw provider objects. */
export function normalizeFixtureRecord(value: unknown): FinanceProjection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_FIXTURE');
  const r = value as Record<string,unknown>;
  if (Object.keys(r).length !== 5 || typeof r.id !== 'string' || !/^fixture-[a-z0-9-]{1,40}$/.test(r.id)
    || typeof r.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.updatedAt)
    || typeof r.amountMinor !== 'number' || !Number.isSafeInteger(r.amountMinor) || r.amountMinor < 0 || r.amountMinor > 2_147_483_647
    || r.currency !== 'BRL' || (r.status !== 'open' && r.status !== 'paid')) throw new Error('INVALID_FIXTURE');
  const date = new Date(r.updatedAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== r.updatedAt) throw new Error('INVALID_FIXTURE');
  return { kind: 'receivable', sourceId: r.id, sourceUpdatedAt: date, amountMinor: r.amountMinor, currency: 'BRL', status: r.status };
}

const pages = [
  [{ id: 'fixture-a', updatedAt: '2026-01-01T00:00:00.000Z', amountMinor: 10000, currency: 'BRL', status: 'open' },
   { id: 'fixture-b', updatedAt: '2026-01-01T00:00:00.000Z', amountMinor: 20000, currency: 'BRL', status: 'open' }],
  [{ id: 'fixture-a', updatedAt: '2026-01-02T00:00:00.000Z', amountMinor: 10000, currency: 'BRL', status: 'paid' },
   { id: 'fixture-b', updatedAt: '2026-01-01T00:00:00.000Z', amountMinor: 20000, currency: 'BRL', status: 'open' }],
] as const;
export function fixturePage(page: number) {
  if (!Number.isInteger(page) || page < 0 || page >= pages.length) throw new Error('INVALID_CURSOR');
  return { records: pages[page].map(normalizeFixtureRecord), done: page === pages.length - 1 };
}

export function requestDigest(key: string) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(key)) throw new Error('INVALID_REQUEST_KEY');
  return createHash('sha256').update(FIXTURE_VERSION + ':' + key).digest('hex');
}
type Version = Pick<FinanceProjection, 'sourceUpdatedAt' | 'amountMinor' | 'currency' | 'status'>;
export function decideRevision(existing: Version | null, incoming: Version): 'insert' | 'update' | 'skip' | 'conflict' {
  if (!existing) return 'insert';
  const diff = incoming.sourceUpdatedAt.getTime() - existing.sourceUpdatedAt.getTime();
  if (diff > 0) return 'update';
  if (diff < 0) return 'skip';
  return existing.amountMinor === incoming.amountMinor && existing.currency === incoming.currency && existing.status === incoming.status ? 'skip' : 'conflict';
}
export function retryState(attempts: number): 'queued' | 'failed' {
  return attempts >= MAX_ATTEMPTS ? 'failed' : 'queued';
}
