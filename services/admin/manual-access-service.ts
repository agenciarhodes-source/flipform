import { hashPassword } from '@/lib/auth';
import { createInternalTenant } from '@/lib/admin/create-internal-tenant';
import { logPlatformAudit } from '@/lib/platform-audit';
import { prisma } from '@/lib/prisma';

const ALLOWED_ROLES = new Set(['owner', 'admin', 'manager', 'agent', 'viewer']);
const ALLOWED_STATUSES = new Set(['pending', 'accepted', 'active', 'blocked', 'revoked', 'expired']);

export type ManualAccessInput = {
  email: string;
  password: string;
  planSlug: string;
  role: string;
  status: string;
  active: boolean;
  tenantId?: string | null;
  adminUserId: string | null;
};

export async function createManualAccess(input: ManualAccessInput) {
  const email = input.email.trim().toLowerCase();
  if (!/.+@.+\..+/.test(email)) throw new Error('INVALID_EMAIL');
  if (input.password.length < 8) throw new Error('INVALID_PASSWORD');
  if (!ALLOWED_ROLES.has(input.role)) throw new Error('INVALID_ROLE');
  if (!ALLOWED_STATUSES.has(input.status)) throw new Error('INVALID_STATUS');

  const plan = await prisma.plan.findFirst({ where: { slug: input.planSlug, isActive: true } })
    ?? await prisma.plan.findFirst({ where: { slug: 'growth', isActive: true } })
    ?? await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { price: 'asc' } });
  if (!plan) throw new Error('NO_ACTIVE_PLAN');

  const hash = await hashPassword(input.password);
  const output = await prisma.$transaction(async (tx) => {
    const tenant = input.tenantId
      ? await tx.tenant.findUnique({ where: { id: input.tenantId } })
      : null;
    const resolvedTenant = tenant ?? await createInternalTenant(tx, { email, planId: plan.id, adminUserId: input.adminUserId });

    const existingSub = await tx.subscription.findFirst({ where: { tenantId: resolvedTenant.id }, select: { id: true } });
    if (!existingSub) {
      await tx.subscription.create({ data: { tenantId: resolvedTenant.id, planId: plan.id, status: 'courtesy', provider: 'manual', paymentRequired: false, paymentProvider: null } });
    }

    const user = await tx.user.upsert({ where: { email }, create: { email, name: email.split('@')[0] || email, passwordHash: hash }, update: { passwordHash: hash } });
    await tx.tenantUser.upsert({ where: { tenantId_userId: { tenantId: resolvedTenant.id, userId: user.id } }, create: { tenantId: resolvedTenant.id, userId: user.id, role: input.role as 'owner', status: 'active' }, update: { role: input.role as 'owner', status: 'active' } });
    const allowedUser = await tx.allowedUser.upsert({
      where: { tenantId_email: { tenantId: resolvedTenant.id, email } },
      create: { tenantId: resolvedTenant.id, email, role: input.role, status: input.status, active: input.active, source: 'manual_admin_access', acceptedAt: new Date(), invitedBy: input.adminUserId },
      update: { role: input.role, status: input.status, active: input.active, source: 'manual_admin_access', acceptedAt: new Date(), invitedBy: input.adminUserId },
    });
    return { tenant: resolvedTenant, user, allowedUser };
  });

  await logPlatformAudit({ tenantId: output.tenant.id, userId: input.adminUserId, entityType: 'allowlist', entityId: output.allowedUser.id, action: 'allowlist.manual_access_created', metadata: { email, planSlug: plan.slug, role: input.role, source: 'manual_admin_access' } });

  return output;
}
