import 'server-only';
import { prisma } from '@/lib/prisma';
import type { SessionPayload } from '@/lib/auth';
import { mayManageApiV1Credentials } from '@/lib/api-v1/prisma-credential-repository';
import { workspace360Access, NO_WORKSPACE_360, type Workspace360Access } from './policy';

/** Use only verified sessions. No change to API key management entitlement. */
export async function getWorkspace360Access(session: SessionPayload): Promise<Workspace360Access> {
  if (!session.tenantId || session.globalRole === 'platform_admin' ||
      !['developer','owner','manager'].includes(session.role)) return {...NO_WORKSPACE_360};
  try {
    const [tenant, member] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: session.tenantId }, select: {
        id: true, status: true, plan: { select: { slug: true, isActive: true } },
        subscriptions: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1,
          select: { status: true, provider: true, paymentRequired: true, providerSubscriptionId: true,
            providerCustomerId: true, plan: { select: { slug: true, isActive: true } } } },
      } }),
      prisma.tenantUser.findUnique({ where: { tenantId_userId: { tenantId: session.tenantId, userId: session.userId } },
        select: { role: true, status: true } }),
    ]);
    if (!tenant || member?.status !== 'active') return {...NO_WORKSPACE_360};
    const result = workspace360Access({ tenantId: tenant.id, sessionTenantId: session.tenantId,
      tenantStatus: tenant.status, role: session.role, globalRole: session.globalRole,
      memberRole: member.role, membershipActive: true, plan: tenant.plan, subscription: tenant.subscriptions[0] ?? null });
    // Preserve existing authorized exceptions; API operations still use the original gate.
    if (session.role === 'developer' && !result.api &&
        await mayManageApiV1Credentials({ tenantId: session.tenantId, userId: session.userId }, session.tenantId)) {
      return {...result, api: true};
    }
    return result;
  } catch { return {...NO_WORKSPACE_360}; }
}
