import { prisma } from '@/lib/prisma';
import { getSession, hashPassword } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';
import { adminError, adminOk } from '@/lib/api/admin-response';
import { normalizeEmail } from '@/lib/email-normalization';

async function requirePlatformAdmin() {
  const session = await getSession();
  if (!session || session.globalRole !== 'platform_admin') return null;
  return session;
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
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
    const slug = normalizeSlug(String(body.slug || ''));
    const ownerEmail = normalizeEmail(String(body.ownerEmail || ''));
    const ownerName = String(body.ownerName || '').trim();
    const requestedPlanSlug = String(body.planSlug || 'growth').trim().toLowerCase() || 'growth';

    if (!name) return NextResponse.json({ error: 'Nome do tenant é obrigatório.', code: 'TENANT_NAME_REQUIRED' }, { status: 400 });
    if (!slug) return NextResponse.json({ error: 'Slug inválido.', code: 'INVALID_SLUG' }, { status: 400 });
    if (!ownerEmail || !ownerEmail.includes('@')) return adminError('E-mail inválido.', 400);

    const existsTenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (existsTenant) {
      return adminError('Slug já está em uso.', 409);
    }

    const plan =
      (await prisma.plan.findFirst({ where: { slug: requestedPlanSlug, isActive: true }, select: { id: true, slug: true } })) ||
      (await prisma.plan.findFirst({ where: { slug: 'growth', isActive: true }, select: { id: true, slug: true } }));

    if (!plan) {
      return adminError('Nenhum plano ativo encontrado para criar cortesia.', 404, { code: 'NO_ACTIVE_PLAN' });
    }

    // Senha aleatória inutilizável: o usuário real deve definir a senha pelo fluxo seguro de primeiro acesso.
    const unusablePasswordHash = await hashPassword(`courtesy-${randomUUID()}`);

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name,
          slug,
          status: 'active',
          planId: plan.id,
          internalNotes: `courtesy tenant${ownerName ? ` (${ownerName})` : ''}`,
        },
        select: { id: true, name: true, slug: true, status: true },
      });

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: 'courtesy',
          provider: 'courtesy',
          paymentRequired: false,
          paymentProvider: null,
        },
      });

      const user = await tx.user.upsert({
        where: { email: ownerEmail },
        update: ownerName ? { name: ownerName } : {},
        create: {
          email: ownerEmail,
          name: ownerName || ownerEmail.split('@')[0] || 'Owner',
          passwordHash: unusablePasswordHash,
        },
        select: { id: true, email: true, name: true },
      });

      await tx.tenantUser.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        update: { role: 'owner', status: 'active' },
        create: { tenantId: tenant.id, userId: user.id, role: 'owner', status: 'active' },
      });

      const allowedUser = await tx.allowedUser.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: ownerEmail } },
        update: { role: 'owner', status: 'active', active: true, acceptedAt: new Date(), invitedBy: session.userId },
        create: { email: ownerEmail, tenantId: tenant.id, role: 'owner', status: 'active', active: true, acceptedAt: new Date(), invitedBy: session.userId },
        select: { id: true, email: true, role: true, status: true, active: true, tenantId: true },
      });

      return { tenant, user, allowedUser };
    });

    await logPlatformAudit({
      tenantId: result.tenant.id,
      userId: session.userId,
      entityType: 'courtesy',
      entityId: result.tenant.id,
      action: 'courtesy.tenant.created',
      metadata: { planSlug: plan.slug, provider: 'courtesy', ownerEmail: result.user.email },
    });

    return adminOk({ tenant: result.tenant, allowedUser: result.allowedUser });
  } catch (error: any) {
    console.error('[admin.tenants.courtesy.POST]', {
      step: 'create-courtesy-tenant',
      message: error instanceof Error ? error.message : String(error),
      code: error?.code,
    });

    if (error?.code === 'EMAIL_ALREADY_LINKED_TO_OTHER_TENANT') {
      return adminError('Este e-mail já está vinculado a outro tenant.', 409);
    }
    if (error?.code === 'P2002') {
      return adminError('Slug já está em uso.', 409);
    }

    return adminError('Falha ao criar tenant de cortesia.', 500);
  }
}
