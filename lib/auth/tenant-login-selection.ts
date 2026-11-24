/**
 * A choice is shown only AFTER the password is validated.
 * AllowedUser and active TenantUser must both grant access; never infer
 * authorization from the existence of a membership alone.
 */
export type LoginTenantMembership = {
  tenantId: string;
  role: string;
  tenant: { name: string; slug: string; status: string };
};
export type LoginTenantChoice = { id: string; name: string; slug: string };
export type LoginTenantDecision =
  | { kind: 'denied' }
  | { kind: 'choose'; choices: LoginTenantChoice[] }
  | { kind: 'ready'; membership: LoginTenantMembership };

const BLOCKED_TENANT_STATUSES = new Set(['suspended', 'blocked', 'canceled', 'inactive']);

export function decideLoginTenant(
  memberships: readonly LoginTenantMembership[],
  activeAllowlistTenantIds: ReadonlySet<string>,
  requestedTenantId?: string,
): LoginTenantDecision {
  const eligible = memberships.filter(m => activeAllowlistTenantIds.has(m.tenantId)
    && !BLOCKED_TENANT_STATUSES.has(m.tenant.status));
  if (requestedTenantId) {
    const selected = eligible.find(m => m.tenantId === requestedTenantId);
    return selected ? { kind: 'ready', membership: selected } : { kind: 'denied' };
  }
  if (eligible.length === 0) return { kind: 'denied' };
  if (eligible.length === 1) return { kind: 'ready', membership: eligible[0] };
  return {
    kind: 'choose',
    choices: eligible.map(m => ({ id: m.tenantId, name: m.tenant.name, slug: m.tenant.slug })),
  };
}
