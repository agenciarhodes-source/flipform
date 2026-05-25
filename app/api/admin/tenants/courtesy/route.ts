import { randomUUID } from 'crypto';
import { getSession } from '@/lib/auth';
import { adminError, adminOk } from '@/lib/api/admin-response';
import { normalizeEmail } from '@/lib/email-normalization';
import { logPlatformAudit } from '@/lib/platform-audit';
import { prisma } from '@/lib/prisma';

async function requirePlatformAdmin() {
  const session = await getSession();
  return session?.globalRole === 'platform_admin' ? session : null;
}

function normalizeSlug(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: Request) {
  try {
    const session = await requirePlatformAdmin();
    if (!session) return adminError('Não autorizado', 403);
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const slugBase = normalizeSlug(String(body.slug || ''));
    const slug = slugBase || `courtesy-${randomUUID().slice(0, 8)}`;
    const ownerEmail = normalizeEmail(String(body.ownerEmail || ''));
    const ownerName = String(body.ownerName || '').trim();
    const requestedPlanSlug = String(body.planSlug || 'growth').trim().toLowerCase();

    if (!name) return adminError('Nome do tenant é obrigatório.', 400, { code: 'TENANT_NAME_REQUIRED' });
    if (!slugBase) return adminError('Slug inválido.', 400, { code: 'INVALID_SLUG' });
    if (!ownerEmail || !isValidEmail(ownerEmail)) return adminError('E-mail inválido.', 400, { code: 'INVALID_OWNER_EMAIL' });

    const existsTenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (existsTenant) return adminError('Slug já está em uso.', 409, { code: 'TENANT_SLUG_ALREADY_EXISTS' });

    const plan =
      (await prisma.plan.findFirst({ where: { slug: requestedPlanSlug, isActive: true }, select: { id: true, slug: true } })) ||
      (await prisma.plan.findFirst({ where: { slug: 'growth', isActive: true }, select: { id: true, slug: true } }));
    if (!plan) return adminError('Nenhum plano ativo encontrado para criar cortesia.', 404, { code: 'NO_ACTIVE_PLAN' });

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name, slug, status: 'active', planId: plan.id, internalNotes: `courtesy tenant${ownerName ? ` (${ownerName})` : ''}` },
        select: { id: true, name: true, slug: true, status: true },
      });
      await tx.subscription.create({ data: { tenantId: tenant.id, planId: plan.id, status: 'courtesy', provider: 'courtesy', paymentRequired: false, paymentProvider: null } });
      const allowedUser = await tx.allowedUser.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: ownerEmail } },
        update: { role: 'owner', status: 'active', active: true, acceptedAt: new Date(), invitedBy: session.userId },
        create: { email: ownerEmail, tenantId: tenant.id, role: 'owner', status: 'active', active: true, acceptedAt: new Date(), invitedBy: session.userId },
        select: { id: true, email: true, role: true, status: true, active: true, tenantId: true },
      });
      return { tenant, allowedUser };
    });

    await logPlatformAudit({ tenantId: result.tenant.id, userId: session.userId, entityType: 'courtesy', entityId: result.tenant.id, action: 'courtesy.tenant.created', metadata: { planSlug: plan.slug, provider: 'courtesy' } });
    return adminOk({ tenant: result.tenant, allowedUser: result.allowedUser });
  } catch (error: any) {
    if (error?.code === 'P2002') return adminError('Slug já está em uso.', 409, { code: 'TENANT_SLUG_ALREADY_EXISTS' });
    return adminError('Falha ao criar tenant de cortesia.', 500, { code: 'COURTESY_CREATE_FAILED' });
  }
}
