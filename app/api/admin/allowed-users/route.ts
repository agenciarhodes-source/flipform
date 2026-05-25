import { getSession, hashPassword } from '@/lib/auth';
import { ensureAdminSchemaReady } from '@/lib/admin/ensure-admin-schema';
import { adminError, adminOk } from '@/lib/api/admin-response';
import { logPlatformAudit } from '@/lib/platform-audit';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';

const ALLOWED_ROLES = new Set(['owner', 'admin', 'manager', 'agent', 'viewer']);
const ALLOWED_STATUSES = new Set(['pending', 'accepted', 'active', 'blocked', 'revoked', 'expired']);

async function requirePlatformAdmin() { const s = await getSession(); return s?.globalRole === 'platform_admin' ? s : null; }
const normalize = (email: string) => String(email || '').trim().toLowerCase();
const validEmail = (email: string) => /.+@.+\..+/.test(email);

async function findPlan(planSlug?: string) {
  return (planSlug ? await prisma.plan.findFirst({ where: { slug: planSlug, isActive: true } }) : null)
    || await prisma.plan.findFirst({ where: { slug: 'growth', isActive: true } })
    || await prisma.plan.findFirst({ where: { slug: 'pro', isActive: true } })
    || await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { price: 'asc' } });
}

async function getSafeInviterId(userId?: string | null) {
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }).catch(() => null);
  return user?.id ?? null;
}

export async function GET(req: Request) {
  try {
    const rl = rateLimit({ key: `admin:allowed-users:get:${getClientIp(req)}`, limit: 60, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl);
    const session = await requirePlatformAdmin();
    if (!session) return adminError('Não autorizado', 403, { code: 'UNAUTHORIZED' });
    await ensureAdminSchemaReady();

    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get('q') || '').trim();
    const tenantId = String(searchParams.get('tenantId') || '').trim();
    const status = String(searchParams.get('status') || '').trim();
    const active = String(searchParams.get('active') || '').trim();
    const where: any = {};
    if (q) where.email = { contains: q, mode: 'insensitive' };
    if (tenantId && tenantId !== 'all') where.tenantId = tenantId;
    if (status && status !== 'all') where.status = status;
    if (active === 'true') where.active = true;
    if (active === 'false') where.active = false;

    const [items, tenants, plans] = await Promise.all([
      prisma.allowedUser.findMany({ where, orderBy: { createdAt: 'desc' }, include: { tenant: { select: { id: true, name: true, slug: true, status: true, plan: { select: { name: true, slug: true } }, subscriptions: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 } } } } }),
      prisma.tenant.findMany({ select: { id: true, name: true, slug: true, status: true }, orderBy: { name: 'asc' } }),
      prisma.plan.findMany({ where: { isActive: true }, orderBy: { price: 'asc' } }),
    ]);

    return adminOk({ items, tenants, plans });
  } catch (error: any) {
    console.error('[admin/allowed-users][GET]', { message: error?.message, code: error?.code, meta: error?.meta, stack: error?.stack });
    return adminError('Falha ao carregar acessos autorizados.', 500, { code: 'ADMIN_ALLOWED_USERS_LOAD_FAILED', prismaCode: error?.code });
  }
}

export async function POST(req: Request) {
  try {
    const rl = rateLimit({ key: `admin:allowed-users:post:${getClientIp(req)}`, limit: 60, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl);
    const session = await requirePlatformAdmin();
    if (!session) return adminError('Não autorizado', 403, { code: 'UNAUTHORIZED' });
    await ensureAdminSchemaReady();

    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode || '').toLowerCase();
    const email = normalize(body.email);
    const password = String(body.password || '');
    const role = String(body.role || 'owner').toLowerCase();
    const status = String(body.status || 'active').toLowerCase();
    const active = body.active === undefined ? true : Boolean(body.active);
    const tenantId = String(body.tenantId || '').trim() || null;
    const planSlug = String(body.planSlug || 'growth').toLowerCase();

    if (!validEmail(email)) return adminError('E-mail inválido.', 400, { code: 'INVALID_EMAIL' });
    if (!ALLOWED_ROLES.has(role)) return adminError('Role inválida.', 400, { code: 'INVALID_ROLE' });
    if (!ALLOWED_STATUSES.has(status)) return adminError('Status inválido.', 400, { code: 'INVALID_STATUS' });

    const inviterId = await getSafeInviterId(session.userId);
    const direct = mode === 'direct' || !tenantId;

    if (direct) {
      if (password.length < 8) return adminError('Senha deve ter ao menos 8 caracteres.', 400, { code: 'INVALID_PASSWORD' });
      const plan = await findPlan(planSlug);
      if (!plan) return adminError('Nenhum plano ativo disponível. Rode npm run admin:repair.', 400, { code: 'NO_ACTIVE_PLAN' });

      const created = await prisma.$transaction(async (tx) => {
        const prefix = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 16) || 'user';
        const slug = `manual-${prefix}-${Math.random().toString(36).slice(2, 8)}`;
        const tenant = await tx.tenant.create({ data: { name: `Acesso ${email}`, slug, status: 'active', planId: plan.id, internalNotes: 'Acesso direto criado manualmente pelo painel admin.' } });
        await tx.subscription.create({ data: { tenantId: tenant.id, planId: plan.id, status: 'courtesy', provider: 'courtesy', paymentRequired: false, paymentProvider: null } });

        const hash = await hashPassword(password);
        const user = await tx.user.upsert({ where: { email }, create: { email, name: email.split('@')[0], passwordHash: hash }, update: { passwordHash: hash } });
        await tx.tenantUser.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } }, create: { tenantId: tenant.id, userId: user.id, role: role as any, status: 'active' }, update: { role: role as any, status: 'active' } });
        const item = await tx.allowedUser.upsert({ where: { tenantId_email: { tenantId: tenant.id, email } }, create: { tenantId: tenant.id, email, role, status: 'active', active: true, source: 'manual-direct-access', acceptedAt: new Date(), invitedBy: inviterId }, update: { role, status: 'active', active: true, source: 'manual-direct-access', acceptedAt: new Date(), invitedBy: inviterId } });
        return { tenant, user, item };
      });

      await logPlatformAudit({ tenantId: created.tenant.id, userId: inviterId, entityType: 'allowlist', entityId: created.item.id, action: 'allowlist.direct_access_created', metadata: { email, role, planSlug: plan.slug } });
      return adminOk({ item: created.item, tenant: created.tenant, user: { id: created.user.id, email: created.user.email, name: created.user.name } });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId! } });
    if (!tenant) return adminError('Tenant não encontrado.', 404, { code: 'TENANT_NOT_FOUND' });
    const item = await prisma.allowedUser.upsert({ where: { tenantId_email: { tenantId: tenant.id, email } }, create: { tenantId: tenant.id, email, role, status, active, invitedBy: inviterId }, update: { role, status, active, invitedBy: inviterId } });
    if (password && password.length >= 8) {
      const hash = await hashPassword(password);
      const user = await prisma.user.upsert({ where: { email }, create: { email, name: email.split('@')[0], passwordHash: hash }, update: { passwordHash: hash } });
      await prisma.tenantUser.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } }, create: { tenantId: tenant.id, userId: user.id, role: role as any, status: 'active' }, update: { role: role as any, status: 'active' } });
    }
    return adminOk({ item });
  } catch (error: any) {
    console.error('[admin/allowed-users][POST]', { message: error?.message, code: error?.code, meta: error?.meta, stack: error?.stack });
    return adminError('Falha ao salvar acesso autorizado.', 500, { code: 'ALLOWED_USER_UPSERT_FAILED', prismaCode: error?.code });
  }
}
