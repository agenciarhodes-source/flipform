import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { SessionPayload } from '@/lib/auth';
import { getBusinessGroupAccessesForUser, mapBusinessGroupRoleToTenantRole } from '@/lib/business-groups';
import { canAccessFlipAi } from './policy';

export type FlipAiDb = PrismaClient | Prisma.TransactionClient;
export class FlipAiError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
export async function requireFlipAiAccess(db: FlipAiDb, session: SessionPayload) {
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
  if (!tenant || !canAccessFlipAi({ role, tenantStatus: tenant.status, plan: tenant.plan, subscription })) {
    throw new FlipAiError('FLIP_AI_ACCESS_REQUIRED', 403, 'O Flip AI está disponível para donos e administradores de empresas com plano Premium ou Premium Pro ativo.');
  }
  return { tenantId: session.tenantId, userId: session.userId };
}
