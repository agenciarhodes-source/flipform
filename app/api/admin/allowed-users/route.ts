import { getSession } from '@/lib/auth';
import { ensureAdminSchemaReady } from '@/lib/admin/ensure-admin-schema';
import { adminError, adminOk } from '@/lib/api/admin-response';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createManualAccess } from '@/services/admin/manual-access-service';

type AllowedUsersFilters = { q?: string; tenantId?: string; status?: string; active?: string };

async function requirePlatformAdmin() { const s = await getSession(); return s?.globalRole === 'platform_admin' ? s : null; }

function logAdminAllowedUsers(event: string, metadata: Record<string, unknown>) {
  console.info('[admin/allowed-users][POST]', { event, ...metadata });
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

    const [items, tenants, plans] = await Promise.all([
      prisma.allowedUser.findMany({ where, orderBy: { createdAt: 'desc' }, include: { tenant: { select: { id: true, name: true, slug: true, status: true, plan: { select: { name: true, slug: true } } } } } }),
      prisma.tenant.findMany({ select: { id: true, name: true, slug: true, status: true }, orderBy: { name: 'asc' } }),
      prisma.plan.findMany({ where: { isActive: true }, orderBy: { price: 'asc' } }),
    ]);

    return adminOk({ items, tenants, plans });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; meta?: unknown; stack?: string };
    console.error('[ADMIN_ACCESS_LIST]', { error: err, message: err?.message, stack: err?.stack });
    return adminError('Falha ao carregar acessos autorizados.', 500, { code: 'ADMIN_ALLOWED_USERS_LOAD_FAILED', prismaCode: err?.code });
  }
}

export async function POST(req: Request) {
  const session = await requirePlatformAdmin();
  if (!session) return adminError('Não autorizado', 403, { code: 'UNAUTHORIZED' });
  try {
    const rl = rateLimit({ key: `admin:allowed-users:post:${getClientIp(req)}`, limit: 60, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl);
    await ensureAdminSchemaReady();

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const payload = {
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
      return adminOk({ item: created.allowedUser, tenant: created.tenant, user: { id: created.user.id, email: created.user.email, name: created.user.name } });
    }

    logAdminAllowedUsers('allowed_user_upsert_requested', { adminUserId: session.userId, email: payload.email, tenantId: payload.tenantId, role: payload.role, status: payload.status, active: payload.active });

    const item = await prisma.allowedUser.upsert({
      where: { tenantId_email: { tenantId: payload.tenantId, email: payload.email } },
      create: { tenantId: payload.tenantId, email: payload.email, role: payload.role, status: payload.status, active: payload.active, invitedBy: session.userId },
      update: { role: payload.role, status: payload.status, active: payload.active, invitedBy: session.userId },
    });
    logAdminAllowedUsers('allowed_user_upserted', { adminUserId: session.userId, email: item.email, tenantId: item.tenantId, allowedUserId: item.id });
    return adminOk({ item });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; meta?: unknown; stack?: string };
    console.error('[admin/allowed-users][POST]', { error: err, message: err?.message, stack: err?.stack });
    return adminError('Falha ao salvar acesso autorizado.', 500, { code: err?.message || 'ALLOWED_USER_UPSERT_FAILED', prismaCode: err?.code });
  }
}
