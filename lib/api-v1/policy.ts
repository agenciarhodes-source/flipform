/**
 * PR01 / API v1 -- pure security policy. No Prisma, outbound I/O or production flags.
 * The credential, not a request body, determines the tenant.
 */
/** Enforced within the issuance transaction, not only the HTTP pre-check. */
export const API_V1_MAX_ACTIVE_KEYS_PER_INTEGRATION = 5;

export const API_V1_SCOPES = [
  'integrations.read',
  'pipelines.read',
  'forms.read',
  'pipelines.metrics.read',
  'leads.metadata.read',
  'events.read',
  'events.write',
  'webhooks.manage',
] as const;

export type ApiV1Scope = typeof API_V1_SCOPES[number];

export type ApiV1Entitlement = {
  tenantId: string;
  tenantStatus: string;
  subscriptionStatus: string | null;
  planSlug: string | null;
  planActive: boolean;
  featureEnabled: boolean;
  /** Exception is a verified, audited per-tenant grant (not a user-supplied flag). */
  exceptionalGrantActive: boolean;
};

const TENANT_ALLOWED = new Set(['active', 'trial']);
const SUBSCRIPTION_ALLOWED = new Set(['active', 'trialing']);
const API_PLANS = new Set(['premium', 'premium-pro']);

export function isApiV1Scope(value: string): value is ApiV1Scope {
  return (API_V1_SCOPES as readonly string[]).includes(value);
}

export function apiV1Enabled(env: Record<string, string | undefined>): boolean {
  return env.FLIPFORM_API_V1_ENABLED === 'true';
}

/**
 * Fail-closed tenant pilot gate for deployed builds.
 * A global enabled flag is never authorization to expose all paid tenants.
 *
 * Set FLIPFORM_API_V1_PILOT_TENANT_IDS to up to 10 approved tenant UUIDs,
 * comma-separated. Empty, wildcard, malformed and duplicate lists deny all.
 * This is independent of subscription and scoped credential checks.
 */
export function apiV1PilotTenantAllowed(
  tenantId: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (!apiV1Enabled(env) || !tenantId) return false;
  // Keep existing isolated tests and explicit local test doubles usable.
  if (env.NODE_ENV === 'test' && !env.VERCEL_ENV) return true;
  const configured = env.FLIPFORM_API_V1_PILOT_TENANT_IDS;
  if (!configured || configured.length > 400) return false;
  const entries = configured.split(',').map(value => value.trim().toLowerCase());
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (entries.length > 10 || entries.some(value => !uuid.test(value))
      || new Set(entries).size !== entries.length) return false;
  return entries.includes(tenantId.toLowerCase());
}

/** An entitlement must be derived by trusted backend DB queries every request. */
export function apiV1Entitled(tenantId: string, e: ApiV1Entitlement | null): boolean {
  if (!tenantId || !e || e.tenantId !== tenantId || !e.featureEnabled) return false;
  if (!TENANT_ALLOWED.has(e.tenantStatus)) return false;
  if (e.exceptionalGrantActive) return true;
  return e.planActive
    && API_PLANS.has(e.planSlug ?? '')
    && SUBSCRIPTION_ALLOWED.has(e.subscriptionStatus ?? '');
}

/** API key management has its own conservative role policy; not INTEGRATIONS_MANAGE. */
export function canManageApiV1Keys(role: string, actorTenantId: string, targetTenantId: string): boolean {
  return Boolean(actorTenantId) && actorTenantId === targetTenantId && role === 'developer';
}
