import { hashPassword } from '@/lib/auth';
import { createInternalTenant } from '@/lib/admin/create-internal-tenant';
import { logPlatformAudit } from '@/lib/platform-audit';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

// Definidos localmente para evitar dependência de Prisma Client gerado
type ValidRole = 'owner' | 'admin' | 'manager' | 'agent' | 'viewer';
type ValidSubscriptionStatus = 'trialing' | 'active' | 'courtesy' | 'past_due' | 'suspended' | 'canceled' | 'unpaid' | 'paused';

const ALLOWED_ROLES = new Set<string>(['owner', 'admin', 'manager', 'agent', 'viewer']);
const ALLOWED_STATUSES = new Set<string>(['pending', 'accepted', 'active', 'blocked', 'revoked', 'expired']);

export class ManualAccessError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message = code, status = 400, details?: unknown) {
    super(message);
    this.name = 'ManualAccessError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function logManualAccess(event: string, metadata: Record<string, unknown>) {
  console.info('[manual-access-service]', { event, ...metadata });
}

export type ManualAccessInput = {
  email: string;
  password: string;
  planSlug: string;
  role: string;
  status: string;
  active: boolean;
  tenantId?: string | null;
  adminUserId?: string | null;
};

async function getSafeInviterId(adminUserId?: string | null): Promise<string | null> {
  if (!adminUserId) return null;
  const admin = await prisma.user.findUnique({ where: { id: adminUserId }, select: { id: true } });
  return admin?.id ?? null;
}

async function resolveActivePlan(planSlug?: string | null) {
  const requestedSlug = String(planSlug || '').trim().toLowerCase();
  return (requestedSlug ? await prisma.plan.findFirst({ where: { slug: requestedSlug, isActive: true } }) : null)
    ?? await prisma.plan.findFirst({ where: { slug: 'growth', isActive: true } })
    ?? await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { price: 'asc' } });
}

export async function createManualAccess(input: ManualAccessInput) {
  const email = input.email.trim().toLowerCase();
  const role = input.role.trim().toLowerCase();
  const status = input.status.trim().toLowerCase();

  if (!/.+@.+\..+/.test(email)) throw new ManualAccessError('INVALID_EMAIL');
  if (!input.password || input.password.length < 8) throw new ManualAccessError('INVALID_PASSWORD');
  if (!ALLOWED_ROLES.has(role)) throw new ManualAccessError('INVALID_ROLE');
  if (!ALLOWED_STATUSES.has(status)) throw new ManualAccessError('INVALID_STATUS');

  logManualAccess('manual_access_service_started', {
    email,
    planSlug: input.planSlug,
    role,
    tenantId: input.tenantId ?? null,
  });

  const plan = await resolveActivePlan(input.planSlug);
  if (!plan) throw new ManualAccessError('NO_ACTIVE_PLAN', 'NO_ACTIVE_PLAN', 409);

  const safeInviterId = await getSafeInviterId(input.adminUserId);
  const hash = await hashPassword(input.password);
  const acceptedAt = new Date();

  const output = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Resolver tenant
    const existingTenant = input.tenantId
      ? await tx.tenant.findUnique({ where: { id: input.tenantId } })
      : null;

    if (input.tenantId && !existingTenant) {
      throw new ManualAccessError('TENANT_NOT_FOUND', 'TENANT_NOT_FOUND', 404, { tenantId: input.tenantId });
    }

    const resolvedTenant = existingTenant
      ? await tx.tenant.update({
          where: { id: existingTenant.id },
          data: { status: 'active', planId: existingTenant.planId ?? plan.id },
        })
      : await createInternalTenant(tx, { email, planId: plan.id, adminUserId: safeInviterId });

    // Criar ou reaproveitar subscription
    let subscription = await tx.subscription.findFirst({
      where: { tenantId: resolvedTenant.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      subscription = await tx.subscription.create({
        data: {
          tenantId: resolvedTenant.id,
          planId: plan.id,
          status: 'courtesy' as ValidSubscriptionStatus,
          provider: 'manual',
          paymentRequired: false,
          paymentProvider: null,
        },
      });
    }

    // Criar ou reaproveitar user — NUNCA duplicar por email
    const existingUser = await tx.user.findUnique({ where: { email } });
    const userReused = Boolean(existingUser);
    const user = existingUser
      ? await tx.user.update({ where: { id: existingUser.id }, data: { passwordHash: hash } })
      : await tx.user.create({
          data: {
            email,
            name: email.split('@')[0] || email,
            passwordHash: hash,
          },
        });

    // Criar ou atualizar TenantUser
    const tenantUser = await tx.tenantUser.upsert({
      where: { tenantId_userId: { tenantId: resolvedTenant.id, userId: user.id } },
      create: { tenantId: resolvedTenant.id, userId: user.id, role: role as ValidRole, status: 'active' },
      update: { role: role as ValidRole, status: 'active' },
    });

    // Criar ou atualizar AllowedUser
    const allowedUser = await tx.allowedUser.upsert({
      where: { tenantId_email: { tenantId: resolvedTenant.id, email } },
      create: {
        tenantId: resolvedTenant.id,
        email,
        role,
        status: 'active',
        active: true,
        source: 'manual_admin_access',
        acceptedAt,
        invitedBy: safeInviterId,
      },
      update: {
        role,
        status: 'active',
        active: true,
        source: 'manual_admin_access',
        acceptedAt,
        invitedBy: safeInviterId,
      },
    });

    return { tenant: resolvedTenant, user, tenantUser, allowedUser, subscription, userReused };
  });

  try {
    await logPlatformAudit({
      tenantId: output.tenant.id,
      userId: safeInviterId,
      entityType: 'allowlist',
      entityId: output.allowedUser.id,
      action: 'allowlist.manual_access_created',
      metadata: {
        email,
        planSlug: plan.slug,
        role,
        source: 'manual_admin_access',
        userReused: output.userReused,
      },
    });
  } catch (auditError) {
    console.error('[manual-access-service]', {
      event: 'audit_log_failed',
      email,
      tenantId: output.tenant.id,
      userId: output.user.id,
      allowedUserId: output.allowedUser.id,
      error: auditError instanceof Error ? auditError.message : String(auditError),
    });
  }

  logManualAccess('manual_access_service_finished', {
    email,
    tenantId: output.tenant.id,
    userId: output.user.id,
    allowedUserId: output.allowedUser.id,
    userReused: output.userReused,
  });

  return output;
}
