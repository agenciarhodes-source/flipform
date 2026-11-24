import type { ApiV1Scope } from './policy';

/**
 * Limited M2M read-key introspection. Never take a tenantId or an integrationId
 * from the caller. Both identifiers come from the authenticated bearer.
 */
export const KEY_IDENTITY_SCOPES = ['pipelines.read', 'forms.read', 'pipelines.metrics.read', 'leads.metadata.read'] as const;
export type KeyIdentityScope = typeof KEY_IDENTITY_SCOPES[number];

export function parseKeyIdentityScope(url: string): KeyIdentityScope | null {
  try {
    const query = new URL(url).searchParams;
    if (query.size !== 1 || query.getAll('scope').length !== 1) return null;
    const scope = query.get('scope');
    return (KEY_IDENTITY_SCOPES as readonly string[]).includes(scope ?? '') ? scope as KeyIdentityScope : null;
  } catch {
    return null;
  }
}

export function identityResponse(tenantId: string, integrationId: string, scope: ApiV1Scope) {
  return {
    version: 'v1' as const,
    tenantId,
    integrationId,
    scope,
    businessData: false as const,
  };
}
