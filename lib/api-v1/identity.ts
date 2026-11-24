import { createHash, timingSafeEqual } from 'node:crypto';
import { apiV1Entitled, isApiV1Scope, type ApiV1Entitlement, type ApiV1Scope } from './policy';

/**
 * The v1 bearer token has a lookup identifier + 32 random bytes.
 * Only SHA-256(secret bytes) is persisted by the future credential repository.
 * Never log raw authorization headers or return credential details to clients.
 */
const BEARER = /^Bearer ffv1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i;
const HASH = /^[a-f0-9]{64}$/i;
const SCOPE_SET = new Set(['integrations.read', 'pipelines.read', 'forms.read', 'pipelines.metrics.read', 'leads.metadata.read', 'events.read', 'events.write', 'webhooks.manage']);

export interface ApiV1CredentialRecord {
  id: string;
  tenantId: string;
  integrationId: string;
  secretHashHex: string;
  scopes: readonly string[];
  revokedAt: Date | null;
  expiresAt: Date | null;
}

export interface ApiV1CredentialRepository {
  findCredential(id: string): Promise<ApiV1CredentialRecord | null>;
  findTenantEntitlement(tenantId: string): Promise<ApiV1Entitlement | null>;
  /**
   * Rate limit must be distributed and fail-closed.
   * NO in-memory fallback; the repository must enforce quota atomically.
   */
  consumeQuota(params: {
    tenantId: string;
    integrationId: string;
    credentialId: string;
    operation: string;
  }): Promise<boolean>;
}

export type ApiV1Authorization =
  | { ok: true; tenantId: string; integrationId: string; scope: ApiV1Scope }
  | { ok: false; status: 401 | 403 | 429 | 503; code: 'invalid_credential' | 'permission_denied' | 'rate_limited' | 'dependency_unavailable' };

const DENIED: ApiV1Authorization = { ok: false, status: 401, code: 'invalid_credential' };
const UNAVAILABLE: ApiV1Authorization = { ok: false, status: 503, code: 'dependency_unavailable' };

export function parseApiV1Bearer(header: string | null): { id: string; secret: Buffer } | null {
  if (!header || header.length > 160) return null;
  const match = BEARER.exec(header);
  if (!match || match[0].length !== header.length) return null;
  const secret = Buffer.from(match[2], 'base64url');
  if (secret.length !== 32 || secret.toString('base64url') !== match[2]) return null;
  return { id: match[1].toLowerCase(), secret };
}

export function digestApiV1Secret(secret: Buffer): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function verifyApiV1Secret(secret: Buffer, hashHex: string): boolean {
  if (secret.length !== 32 || !HASH.test(hashHex)) return false;
  const observed = createHash('sha256').update(secret).digest();
  const expected = Buffer.from(hashHex, 'hex');
  return expected.length === observed.length && timingSafeEqual(expected, observed);
}

export async function authorizeApiV1Request(
  args: { authorizationHeader: string | null; scope: ApiV1Scope; operation: string; now?: Date; requireExclusiveScope?: boolean },
  repository: ApiV1CredentialRepository | null,
): Promise<ApiV1Authorization> {
  if (!repository) return UNAVAILABLE; // No backing store configured.
  if (!isApiV1Scope(args.scope) || !args.operation || args.operation.length > 120) {
    return { ok: false, status: 403, code: 'permission_denied' };
  }
  const token = parseApiV1Bearer(args.authorizationHeader);
  if (!token) return DENIED;

  try {
    const credential = await repository.findCredential(token.id);
    if (!credential || !credential.tenantId || !credential.integrationId
      || credential.id.toLowerCase() !== token.id
      || credential.revokedAt !== null
      || (credential.expiresAt !== null && !(credential.expiresAt > (args.now ?? new Date())))
      || !verifyApiV1Secret(token.secret, credential.secretHashHex)) {
      return DENIED;
    }
    if (!credential.scopes.every((scope) => SCOPE_SET.has(scope))
      || !credential.scopes.includes(args.scope)
      || (args.requireExclusiveScope === true && (credential.scopes.length !== 1 || credential.scopes[0] !== args.scope))) {
      return { ok: false, status: 403, code: 'permission_denied' };
    }
    const entitlement = await repository.findTenantEntitlement(credential.tenantId);
    if (!apiV1Entitled(credential.tenantId, entitlement)) {
      return { ok: false, status: 403, code: 'permission_denied' };
    }
    // Critical path -- quota infrastructure outage must NOT turn into allowance.
    const quotaAvailable = await repository.consumeQuota({
      tenantId: credential.tenantId,
      integrationId: credential.integrationId,
      credentialId: credential.id,
      operation: args.operation,
    });
    if (!quotaAvailable) return { ok: false, status: 429, code: 'rate_limited' };
    return { ok: true, tenantId: credential.tenantId, integrationId: credential.integrationId, scope: args.scope };
  } catch {
    return UNAVAILABLE; // never expose DB errors, tokens or connection metadata
  }
}
