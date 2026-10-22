import 'server-only';

import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { createFirstAccessToken, hasRecentActiveFirstAccessToken } from '@/lib/first-access';
import { sendTransactionalEmail } from '@/lib/email/send';
import { getAppLoginUrl } from '@/lib/public-urls';

/**
 * Opens the company to its team after the subscription starts (trial) or is paid: the company
 * becomes active (or trial), the people invited at checkout get access, and the owner receives
 * the first-access link once. A canceled or blocked company is never reopened here.
 */
export async function releaseTenantAccess(input: {
  tenantId: string;
  subscriptionId: string | null;
  tenantStatus: 'trial' | 'active';
  provider: string;
  reference: string;
}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { status: true, name: true } });
  if (!tenant || tenant.status === 'canceled' || tenant.status === 'blocked') return { released: false as const };

  await prisma.tenant.updateMany({
    where: { id: input.tenantId, status: { notIn: ['canceled', 'blocked'] } },
    data: { status: input.tenantStatus },
  });
  await prisma.allowedUser.updateMany({
    where: { tenantId: input.tenantId, active: false, status: { in: ['pending', 'inactive'] } },
    data: { active: true, status: 'active', acceptedAt: new Date() },
  });
  await logAudit({
    tenantId: input.tenantId,
    entityType: 'billing',
    entityId: input.subscriptionId || input.reference,
    action: 'billing.checkout_access_released',
    metadata: { provider: input.provider, reference: input.reference, tenantStatus: input.tenantStatus, previousTenantStatus: tenant.status },
  });

  const subscription = input.subscriptionId
    ? await prisma.subscription.findUnique({ where: { id: input.subscriptionId }, select: { plan: { select: { name: true } } } })
    : null;
  const owner = await prisma.allowedUser.findFirst({
    where: { tenantId: input.tenantId, active: true },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });
  if (!owner?.email) return { released: true as const, emailSent: false };

  try {
    // The owner may already have an account (a returning customer): the link is sent only when needed.
    const existingUser = await prisma.user.findUnique({ where: { email: owner.email }, select: { id: true } });
    if (existingUser || await hasRecentActiveFirstAccessToken({ email: owner.email, tenantId: input.tenantId })) {
      return { released: true as const, emailSent: false };
    }
    const firstAccess = await createFirstAccessToken({ email: owner.email, tenantId: input.tenantId, userId: null });
    const result = await sendTransactionalEmail({
      to: owner.email,
      tenantId: input.tenantId,
      userId: null,
      template: 'plan_activated',
      params: {
        name: tenant.name || 'cliente',
        planName: subscription?.plan?.name || 'Plano FlipForm',
        email: owner.email,
        firstAccessUrl: firstAccess.url,
        appLoginUrl: getAppLoginUrl(),
      },
    });
    await logAudit({
      tenantId: input.tenantId,
      entityType: 'email',
      entityId: owner.email,
      action: result.ok ? 'email.activation_sent' : 'email.activation_skipped_provider_missing',
      metadata: { provider: input.provider },
    });
    return { released: true as const, emailSent: result.ok };
  } catch (error) {
    console.error('[billing.release-access]', { message: error instanceof Error ? error.message : 'unknown' });
    await logAudit({ tenantId: input.tenantId, entityType: 'email', entityId: owner.email, action: 'email.activation_failed' });
    return { released: true as const, emailSent: false };
  }
}
