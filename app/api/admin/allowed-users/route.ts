import { getSession } from '@/lib/auth';
import { ensureAdminSchemaReady } from '@/lib/admin/ensure-admin-schema';
import { adminError, adminOk } from '@/lib/api/admin-response';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createManualAccess } from '@/services/admin/manual-access-service';

const ERROR_STATUS: Record<string, number> = {
  INVALID_EMAIL: 400,
  INVALID_PASSWORD: 400,
  INVALID_ROLE: 400,
  INVALID_STATUS: 400,
  TENANT_NOT_FOUND: 404,
  NO_ACTIVE_PLAN: 409,
  DB_SCHEMA_NOT_READY: 503,
  ADMIN_SCHEMA_NOT_READY: 503,
  P2002: 409,
  P2003: 409,
};

type AllowedUsersFilters = { q?: string; tenantId?: string; status?: string; active?: string };
type ErrorLike = { message?: string; code?: string; meta?: unknown; stack?: string; details?: unknown; status?: number; name?: string };

async function requirePlatformAdmin() { const s = await getSession(); return s?.globalRole === 'platform_admin' ? s : null; }

function logAdminAllowedUsers(event: string, metadata: Record<string, unknown>) {
  console.info('[admin/allowed-users]', { event, ...metadata });
}

function toErrorDetails(error: unknown) {
  const err = error as ErrorLike;
  const prismaCode = typeof err?.code === 'string' && /^P\d+/.test(err.code) ? err.code : undefined;
  const code = prismaCode || err?.code || (err?.message && /^[A-Z0-9_]+$/.test(err.message) ? err.message : undefined) || 'ALLOWED_USER_UPSERT_FAILED';
  return {
    code,
    prismaCode,
    message: err?.message || 'Erro desconhecido',
    meta: err?.meta,
    details: err?.details,
    stack: err?.stack,
    status: err?.status || ERROR_STATUS[code] || 500,
  };
}

export async function GET(req: Request) {
  try {
    const rl = rateLimit({ key: `admin:allowed-users:get:${getClientIp(req)}`, limit: 60, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl);
    const session = await requirePlatformAdmin();
    if (!session) return adminError('Não autorizado', 403, { code: 'UNAUTHORIZED' });
    await ensureAdminSchemaReady();

    const { searchParams } = new URL(req.url);
    const filters: AllowedUsersFilters = {
      q: String(searchParams.get('q') || '').trim(),
      tenantId: String(searchParams.get('tenantId') || '').trim(),
      status: String(searchParams.get('status') || '').trim(),
      active: String(searchParams.get('active') || '').trim(),
    };

    const where: { email?: { contains: string; mode: 'insensitive' }; tenantId?: string; status?: string; active?: boolean } = {};
    if (filters.q) where.email = { contains: filters.q, mode: 'insensitive' };
    if (filters.tenantId && filters.tenantId !== 'all') where.tenantId = filters.tenantId;
    if (filters.status && filters.status !== 'all') where.status = filters.status;
    if (filters.active === 'true') where.active = true;
    if (filters.active === 'false') where.active = false;

    const [allowedUsers, tenants, plans, subscriptions] = await Promise.all([
      prisma.allowedUser.findMany({ where, orderBy: { createdAt: 'desc' } }),
      prisma.tenant.findMany({ select: { id: true, name: true, slug: true, status: true, planId: true }, orderBy: { name: 'asc' } }),
      prisma.plan.findMany({ where: { isActive: true }, orderBy: { price: 'asc' } }),
      prisma.subscription.findMany({ select: { id: true, tenantId: true, planId: true, status: true, provider: true, paymentRequired: true, paymentProvider: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: 'desc' } }),
    ]);

    const tenantsById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    const plansById = new Map(plans.map((plan) => [plan.id, plan]));
    const subscriptionByTenant = new Map(subscriptions.map((subscription) => [subscription.tenantId, subscription]));
    const items = allowedUsers.map((item) => {
      const tenant = tenantsById.get(item.tenantId) || null;
      const plan = tenant?.planId ? plansById.get(tenant.planId) || null : null;
      return {
        ...item,
        tenant: tenant ? { ...tenant, plan: plan ? { name: plan.name, slug: plan.slug } : null } : null,
        subscription: subscriptionByTenant.get(item.tenantId) || null,
      };
    });

    return adminOk({ items, tenants, plans });
  } catch (error: unknown) {
    const details = toErrorDetails(error);
    console.error('[admin/allowed-users][GET]', {
      message: details.message,
      code: details.code,
      prismaCode: details.prismaCode,
      meta: details.meta,
      details: details.details,
      stack: details.stack,
    });
    return adminError('Falha ao carregar acessos autorizados.', details.status, {
      code: details.code,
      prismaCode: details.prismaCode,
      message: details.message,
      meta: details.meta,
      details: details.details,
    });
  }
}

export async function POST(req: Request) {
  const session = await requirePlatformAdmin();
  if (!session) return adminError('Não autorizado', 403, { code: 'UNAUTHORIZED' });

  let payload: {
    email: string;
    password: string;
    role: string;
    status: string;
    active: boolean;
    tenantId: string | null;
    planSlug: string;
    mode: string;
  } | null = null;

  try {
    const rl = rateLimit({ key: `admin:allowed-users:post:${getClientIp(req)}`, limit: 60, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl);
    await ensureAdminSchemaReady();

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    payload = {
      email: String(body.email || '').trim().toLowerCase(),
      password: String(body.password || ''),
      role: String(body.role || 'owner').toLowerCase(),
      status: String(body.status || 'active').toLowerCase(),
      active: body.active === undefined ? true : Boolean(body.active),
      tenantId: String(body.tenantId || '').trim() || null,
      planSlug: String(body.planSlug || 'growth').toLowerCase(),
      mode: String(body.mode || '').toLowerCase(),
    };

    if (payload.mode === 'direct' || !payload.tenantId) {
      const manualPayload = { ...payload, status: 'active', active: true, adminUserId: session.userId };
      logAdminAllowedUsers('manual_access_requested', {
        adminUserId: session.userId,
        email: manualPayload.email,
        tenantId: manualPayload.tenantId,
        planSlug: manualPayload.planSlug,
        role: manualPayload.role,
      });
      const created = await createManualAccess(manualPayload);
      logAdminAllowedUsers('manual_access_created', {
        adminUserId: session.userId,
        email: created.user.email,
        tenantId: created.tenant.id,
        userId: created.user.id,
        allowedUserId: created.allowedUser.id,
      });
      return adminOk({
        item: created.allowedUser,
        tenant: created.tenant,
        user: { id: created.user.id, email: created.user.email, name: created.user.name },
        tenantUser: created.tenantUser,
        subscription: created.subscription,
      });
    }

    const tenantId = payload.tenantId;
    if (!tenantId) throw new Error('TENANT_NOT_FOUND');

    logAdminAllowedUsers('allowed_user_upsert_requested', { adminUserId: session.userId, email: payload.email, tenantId, role: payload.role, status: payload.status, active: payload.active });
    const safeInviter = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true } });

    const item = await prisma.allowedUser.upsert({
      where: { tenantId_email: { tenantId, email: payload.email } },
      create: { tenantId, email: payload.email, role: payload.role, status: payload.status, active: payload.active, invitedBy: safeInviter?.id ?? null },
      update: { role: payload.role, status: payload.status, active: payload.active, invitedBy: safeInviter?.id ?? null },
    });
    logAdminAllowedUsers('allowed_user_upserted', { adminUserId: session.userId, email: item.email, tenantId: item.tenantId, allowedUserId: item.id });
    return adminOk({ item });
  } catch (error: unknown) {
    const details = toErrorDetails(error);
    console.error('[admin/allowed-users][POST]', {
      message: details.message,
      code: details.code,
      prismaCode: details.prismaCode,
      meta: details.meta,
      stack: details.stack,
      payload: payload ? {
        email: payload.email,
        tenantId: payload.tenantId,
        planSlug: payload.planSlug,
        role: payload.role,
        status: payload.status,
        mode: payload.mode,
      } : null,
    });
    return adminError('Falha ao salvar acesso autorizado.', details.status, {
      code: details.code,
      prismaCode: details.prismaCode,
      message: details.message,
      meta: details.meta,
      details: details.details,
    });
  }
}
