import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { adminError, adminOk } from '@/lib/api/admin-response';
import { logPlatformAudit } from '@/lib/platform-audit';

const slugify = (v: string) => v.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
const validEmail = (email: string) => /.+@.+\..+/.test(email);

async function planBySlug(slug?: string) {
  return (slug ? await prisma.plan.findFirst({ where: { slug, isActive: true } }) : null)
    || await prisma.plan.findFirst({ where: { slug: 'growth', isActive: true } })
    || await prisma.plan.findFirst({ where: { slug: 'pro', isActive: true } })
    || await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { price: 'asc' } });
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || session.globalRole !== 'platform_admin') return adminError('Não autorizado', 403, { code: 'UNAUTHORIZED' });

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const slug = slugify(String(body.slug || ''));
    const ownerEmail = String(body.ownerEmail || '').trim().toLowerCase();
    const ownerName = String(body.ownerName || '').trim();
    const planSlug = String(body.planSlug || 'growth').trim().toLowerCase();

    if (!name) return adminError('Nome do tenant é obrigatório.', 400, { code: 'TENANT_NAME_REQUIRED' });
    if (!slug) return adminError('Slug inválido.', 400, { code: 'INVALID_SLUG' });
    if (!validEmail(ownerEmail)) return adminError('E-mail do owner é inválido.', 400, { code: 'INVALID_OWNER_EMAIL' });

    const plan = await planBySlug(planSlug);
    if (!plan) return adminError('Nenhum plano ativo encontrado. Rode npm run admin:repair.', 400, { code: 'NO_ACTIVE_PLAN' });

    const created = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name, slug, status: 'active', planId: plan.id, internalNotes: `Acesso de cortesia (${ownerName || ownerEmail})` } });
      await tx.subscription.create({ data: { tenantId: tenant.id, planId: plan.id, status: 'courtesy', provider: 'courtesy', paymentRequired: false, paymentProvider: null } });
      const user = await tx.user.upsert({ where: { email: ownerEmail }, create: { email: ownerEmail, name: ownerName || ownerEmail.split('@')[0], passwordHash: 'RESET_REQUIRED_NO_PASSWORD' }, update: { name: ownerName || undefined } });
      await tx.tenantUser.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } }, create: { tenantId: tenant.id, userId: user.id, role: 'owner', status: 'active' }, update: { role: 'owner', status: 'active' } });
      const allowedUser = await tx.allowedUser.upsert({ where: { tenantId_email: { tenantId: tenant.id, email: ownerEmail } }, create: { tenantId: tenant.id, email: ownerEmail, role: 'owner', status: 'active', active: true, acceptedAt: new Date(), invitedBy: session.userId, source: 'courtesy-admin' }, update: { role: 'owner', status: 'active', active: true, acceptedAt: new Date(), invitedBy: session.userId, source: 'courtesy-admin' } });
      return { tenant, allowedUser };
    });

    await logPlatformAudit({ tenantId: created.tenant.id, userId: session.userId, entityType: 'courtesy', entityId: created.tenant.id, action: 'courtesy.tenant.created', metadata: { planSlug: plan.slug } });
    return adminOk({ tenant: created.tenant, allowedUser: created.allowedUser });
  } catch (error: any) {
    console.error('[admin/tenants/courtesy][POST]', { message: error?.message, code: error?.code, meta: error?.meta, stack: error?.stack });
    return adminError('Falha ao criar tenant de cortesia.', 500, { code: 'COURTESY_CREATE_FAILED', prismaCode: error?.code });
  }
}
