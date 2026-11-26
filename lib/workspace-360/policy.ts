/** Read-only workspace navigation rules, never an API credential entitlement. */
export type Workspace360Access = { api: boolean; universal: boolean; intelligence: boolean; ads: boolean };
export const NO_WORKSPACE_360: Workspace360Access = { api: false, universal: false, intelligence: false, ads: false };
type Plan = { slug: string; isActive: boolean };
export type WorkspaceFacts = { tenantId: string; sessionTenantId: string; tenantStatus: string; role: string; globalRole?: string | null; memberRole: string | null; membershipActive: boolean; plan: Plan | null; subscription: { status: string; provider: string; paymentRequired: boolean; providerSubscriptionId: string | null; providerCustomerId: string | null; plan: Plan } | null };
export function workspace360Access(f: WorkspaceFacts): Workspace360Access {
  if (!f.tenantId || f.tenantId !== f.sessionTenantId || !f.membershipActive || f.globalRole === 'platform_admin' ||
      !['active','trial'].includes(f.tenantStatus) || !f.plan?.isActive || !f.subscription?.plan.isActive ||
      f.plan.slug !== f.subscription.plan.slug || f.subscription.provider === 'business_group') return {...NO_WORKSPACE_360};
  const s = f.subscription;
  const courtesy = s.status === 'courtesy' && s.provider === 'manual' && !s.paymentRequired &&
      s.providerSubscriptionId === null && s.providerCustomerId === null;
  if (!['active','trialing'].includes(s.status) && !courtesy) return {...NO_WORKSPACE_360};
  const premium = ['premium','premium-pro'].includes(f.plan.slug);
  const developer = f.role === 'developer';
  const owner = f.role === 'owner' && f.memberRole === 'owner';
  const manager = f.role === 'manager' && f.memberRole === 'manager';
  return { api: premium && developer, universal: premium && developer,
    intelligence: premium && (developer || owner || manager), ads: f.plan.slug === 'premium-pro' && (developer || owner) };
}
