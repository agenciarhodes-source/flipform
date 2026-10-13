import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { SessionPayload } from '@/lib/auth';
import { getBusinessGroupAccessesForUser, mapBusinessGroupRoleToTenantRole } from '@/lib/business-groups';
import { isFlipAiPilotTenant } from './pilot-access';
import { canAccessFlipAi, canServeFlipAiPilot } from './policy';

export type FlipAiDb = PrismaClient | Prisma.TransactionClient;
export class FlipAiError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
export async function requireFlipAiAccess(
  db: FlipAiDb,
  session: SessionPayload,
  options?: { pilotTenantIds?: string },
) {
  if (!session.tenantId) throw new FlipAiError('FLIP_AI_ACCESS_REQUIRED', 403, 'Selecione uma empresa com plano Premium.');
  const [membership, tenant, subscription] = await Promise.all([
    db.tenantUser.findUnique({ where: { tenantId_userId: { tenantId: session.tenantId, userId: session.userId } }, select: { role: true, status: true } }),
    db.tenant.findUnique({ where: { id: session.tenantId }, select: { status: true, plan: { select: { slug: true, isActive: true } } } }),
    db.subscription.findFirst({ where: { tenantId: session.tenantId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { status: true, gracePeriodEndsAt: true, plan: { select: { slug: true, isActive: true } } } }),
  ]);
  let role: string | null = membership?.status === 'active' ? membership.role : null;
  if (!membership) {
    const groups = await getBusinessGroupAccessesForUser(db, session.userId);
    const group = groups.accesses.find((access) => access.tenants.some((tenant) => tenant.id === session.tenantId));
    role = group ? mapBusinessGroupRoleToTenantRole(group.role) : null;
  }
  const planAccess = Boolean(tenant && canAccessFlipAi({
    role,
    tenantStatus: tenant.status,
    plan: tenant.plan,
    subscription,
  }));
  const pilotAccess = Boolean(tenant
    && ['owner', 'admin'].includes(role || '')
    && isFlipAiPilotTenant(session.tenantId, options?.pilotTenantIds)
    && canServeFlipAiPilot({ tenantStatus: tenant.status, subscription }));
  if (!tenant || (!planAccess && !pilotAccess)) {
    throw new FlipAiError('FLIP_AI_ACCESS_REQUIRED', 403,
      'O Flip AI está disponível para donos e administradores com plano Premium ativo ou piloto autorizado.');
  }
  return { tenantId: session.tenantId, userId: session.userId, accessMode: planAccess ? 'plan' as const : 'pilot' as const };
}
