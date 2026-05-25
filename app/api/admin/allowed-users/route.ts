import { randomUUID } from 'crypto';
import { getSession, hashPassword } from '@/lib/auth';
import { ensureAdminSchemaReady } from '@/lib/admin/ensure-admin-schema';
import { adminError, adminOk } from '@/lib/api/admin-response';
import { normalizeEmail } from '@/lib/email-normalization';
import { logPlatformAudit } from '@/lib/platform-audit';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';

const ALLOWED_ROLES = new Set(['owner', 'admin', 'manager', 'agent', 'viewer']);
const ALLOWED_STATUSES = new Set(['pending', 'accepted', 'active', 'blocked', 'revoked', 'expired']);

async function requirePlatformAdmin() { const s = await getSession(); return s?.globalRole === 'platform_admin' ? s : null; }
function isValidEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function slugify(value: string) { return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''); }
async function findActivePlan(planSlug?: string) {
  const slug = String(planSlug || '').trim().toLowerCase();
  return (slug ? await prisma.plan.findFirst({ where: { slug, isActive: true }, select: { id: true, slug: true } }) : null)
  || await prisma.plan.findFirst({ where: { slug: 'growth', isActive: true }, select: { id: true, slug: true } })
  || await prisma.plan.findFirst({ where: { slug: 'pro', isActive: true }, select: { id: true, slug: true } })
  || await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { price: 'asc' }, select: { id: true, slug: true } });
}

export async function GET(req: Request) {
  try {
    const rl = rateLimit({ key: `admin:allowed-users:get:ip:${getClientIp(req)}`, limit: 60, windowMs: 60 * 1000 });
    if (!rl.allowed) return rateLimitResponse(rl);
    const session = await requirePlatformAdmin();
    if (!session) return adminError('Não autorizado', 403);
    await ensureAdminSchemaReady();

    const { searchParams } = new URL(req.url);
    const q = normalizeEmail(String(searchParams.get('q') || ''));
    const tenantId = String(searchParams.get('tenantId') || '').trim();
    const status = String(searchParams.get('status') || '').trim();
    const active = String(searchParams.get('active') || '').trim();
    const where: any = {};
    if (q) where.email = { contains: q, mode: 'insensitive' };
    if (tenantId && tenantId !== 'all') where.tenantId = tenantId;
    if (status && status !== 'all') where.status = status;
    if (active === 'true') where.active = true;
    if (active === 'false') where.active = false;

    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, slug: true, status: true }, orderBy: { name: 'asc' } });
    const items = await prisma.allowedUser.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        tenant: {
          select: {
            id: true, name: true, slug: true, status: true,
            plan: { select: { name: true, slug: true } },
            subscriptions: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    return adminOk({ items, tenants });
  } catch (error) { console.error('[admin/allowed-users][GET]', error); return adminError('Falha ao carregar acessos autorizados.', 500); }
}

export async function POST(req: Request) {
  try {
    const rl = rateLimit({ key: `admin:allowed-users:post:ip:${getClientIp(req)}`, limit: 60, windowMs: 60 * 1000 });
    if (!rl.allowed) return rateLimitResponse(rl);
    const session = await requirePlatformAdmin();
    if (!session) return adminError('Não autorizado', 403);
    await ensureAdminSchemaReady();

    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(String(body.email || ''));
    const tenantId = String(body.tenantId || '').trim();
    const password = String(body.password || '').trim();
    const planSlug = String(body.planSlug || 'growth').trim().toLowerCase();
    const role = String(body.role || 'owner').trim().toLowerCase();
    const status = String(body.status || 'active').trim().toLowerCase();
    const active = body.active === undefined ? true : Boolean(body.active);

    if (!email || !isValidEmail(email)) return adminError('E-mail inválido.', 400);
    if (!ALLOWED_ROLES.has(role)) return adminError('Role inválida.', 400);
    if (!ALLOWED_STATUSES.has(status)) return adminError('Status inválido.', 400);

    if (!tenantId) {
      if (password.length < 8) return adminError('Informe uma senha com pelo menos 8 caracteres.', 400);
      const plan = await findActivePlan(planSlug);
      if (!plan) return adminError('Nenhum plano ativo encontrado para criar o acesso.', 404);

      const passwordHash = await hashPassword(password);
      const local = slugify(email.split('@')[0] || 'cliente') || 'cliente';
      const slug = `manual-${local}-${randomUUID().slice(0, 8)}`;

      const result = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: { name: `Acesso ${email}`, slug, status: 'active', planId: plan.id, internalNotes: 'Acesso direto criado manualmente pelo painel admin.' },
          select: { id: true, name: true, slug: true, status: true },
        });
        await tx.subscription.create({ data: { tenantId: tenant.id, planId: plan.id, status: 'courtesy', provider: 'courtesy', paymentRequired: false, paymentProvider: null } });
        const user = await tx.user.upsert({
          where: { email },
          update: { passwordHash },
          create: { email, name: email.split('@')[0] || 'Cliente', passwordHash },
          select: { id: true, email: true },
        });
        await tx.tenantUser.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } }, update: { role: 'owner', status: 'active' }, create: { tenantId: tenant.id, userId: user.id, role: 'owner', status: 'active' } });
        const item = await tx.allowedUser.upsert({
          where: { tenantId_email: { tenantId: tenant.id, email } },
          update: { role: 'owner', status: 'active', active: true, source: 'manual-direct-access', acceptedAt: new Date(), invitedBy: session.userId },
          create: { tenantId: tenant.id, email, role: 'owner', status: 'active', active: true, source: 'manual-direct-access', acceptedAt: new Date(), invitedBy: session.userId },
        });
        return { tenant, user, item };
      });

      await logPlatformAudit({ tenantId: result.tenant.id, userId: session.userId, entityType: 'allowlist', entityId: result.item.id, action: 'allowlist.direct_access_created', metadata: { email, planSlug: plan.slug, role: 'owner', status: 'active', active: true } });
      return adminOk({ item: result.item, tenant: result.tenant, user: result.user });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return adminError('Tenant não encontrado.', 404);
    const item = await prisma.allowedUser.upsert({ where: { tenantId_email: { tenantId, email } }, update: { role, status, active, invitedBy: session.userId }, create: { tenantId, email, role, status, active, invitedBy: session.userId } });
    await logPlatformAudit({ tenantId, userId: session.userId, entityType: 'allowlist', entityId: item.id, action: 'allowlist.email.upserted', metadata: { email, role, status, active } });
    return adminOk({ item });
  } catch (error) { console.error('[admin/allowed-users][POST]', error); return adminError('Falha ao salvar acesso autorizado.', 500); }
}
