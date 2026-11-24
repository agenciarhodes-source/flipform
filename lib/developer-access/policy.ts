/**
 * Developer access policy for FlipForm.
 *
 * This module defines the target boundary. Production routes must adopt these
 * checks in the same PR before rollout. No role is inferred from an email address.
 */
export const TECHNICAL_MODULES = [
  'integrations', 'api_credentials', 'domains', 'automations',
  'support_configuration', 'flip_ai_configuration',
  'whatsapp_ai_configuration', 'instagram_ai_configuration',
] as const;
export type TechnicalModule = typeof TECHNICAL_MODULES[number];

export const COMPANY_ROLES = ['owner', 'admin', 'manager', 'agent', 'viewer'] as const;
export type CompanyRole = typeof COMPANY_ROLES[number];

export type DeveloperGrant = Readonly<{
  userId: string;
  tenantId: string;
  status: 'active' | 'revoked';
  grantedByPlatformAdmin: boolean;
  mfaEnabled: boolean;
  mfaVerifiedInSession: boolean;
}>;

/** A platform administrator must issue a per-tenant grant. No implicit global bypass. */
export function canUseDeveloperModule(
  grant: DeveloperGrant | null | undefined,
  session: { userId: string; tenantId: string },
  module: TechnicalModule,
): boolean {
  return TECHNICAL_MODULES.includes(module)
    && !!grant
    && grant.userId === session.userId
    && grant.tenantId === session.tenantId
    && grant.status === 'active'
    && grant.grantedByPlatformAdmin
    && grant.mfaEnabled
    && grant.mfaVerifiedInSession;
}

export function companyMayConfigureTechnicalModule(role: string, module: TechnicalModule): boolean {
  // An owner can see business data, billing, users and reports but not these technical controls.
  return false;
}

export function canIssueDeveloperGrant(actor: { globalRole?: string | null; mfaVerifiedInSession: boolean }): boolean {
  return actor.globalRole === 'platform_admin' && actor.mfaVerifiedInSession;
}

export function maySwitchDeveloperTenant(
  userId: string,
  destinationTenantId: string,
  grants: readonly DeveloperGrant[],
): boolean {
  return grants.some(g => canUseDeveloperModule(g, { userId, tenantId: destinationTenantId }, 'integrations'));
}
