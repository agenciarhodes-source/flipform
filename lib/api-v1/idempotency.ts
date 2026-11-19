import { createHash } from 'node:crypto';

/**
 * A pure, offline component only. Durable keys, transactional writes and
 * concurrent claims MUST be implemented against tenant-scoped DB constraints
 * before any business mutation is exposed.
 */
export type ApiV1IdempotencyIdentity = {
  tenantId: string;
  integrationId: string;
  operation: string;
  key: string;
};

const KEY = /^[A-Za-z0-9._:-]{8,128}$/;

export function validIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && KEY.test(value);
}

export function idempotencyScope(identity: ApiV1IdempotencyIdentity): string | null {
  if (!identity.tenantId || !identity.integrationId || !identity.operation
    || !validIdempotencyKey(identity.key)) return null;
  // Hash includes tenant+integration+operation so a key cannot collide across companies.
  return createHash('sha256').update(JSON.stringify([
    identity.tenantId, identity.integrationId, identity.operation, identity.key,
  ])).digest('hex');
}

export function requestFingerprint(operation: string, canonicalRequestBody: string): string | null {
  if (!operation || canonicalRequestBody.length > 1_000_000) return null;
  return createHash('sha256')
    .update(operation).update('\0').update(canonicalRequestBody).digest('hex');
}
