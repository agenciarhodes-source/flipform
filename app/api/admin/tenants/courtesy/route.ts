import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';

async function requirePlatformAdmin() {
  const session = await getSession();
  if (!session || session.globalRole !== 'platform_admin') return null;
  return session;
}

function normalizeSlug(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export async function POST(req: Request) {
  try {
    const session = await requirePlatformAdmin();
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const slug = normalizeSlug(String(body.slug || ''));
    const ownerEmail = String(body.ownerEmail || '').trim().toLowerCase();
    const ownerName = String(body.ownerName || '').trim();
    const requestedPlanSlug = String(body.planSlug || 'growth').trim().toLowerCase() || 'growth';

    if (!name) return NextResponse.json({ error: 'Nome do tenant é obrigatório' }, { status: 400 });
    if (!slug) return NextResponse.json({ error: 'Slug é obrigatório' }, { status: 400 });
    if (!ownerEmail || !ownerEmail.includes('@')) return NextResponse.json({ error: 'E-mail do owner é obrigatório e deve ser válido' }, { status: 400 });

    const existsTenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (existsTenant) return NextResponse.json({ error: 'Já existe um tenant com este slug.', code: 'TENANT_SLUG_ALREADY_EXISTS' }, { status: 409 });

    const plan = await prisma.plan.findFirst({ where: { slug: requestedPlanSlug, isActive: true }, select: { id: true, slug: true } })
      || await prisma.plan.findFirst({ where: { slug: 'growth', isActive: true }, select: { id: true, slug: true } })
      || await prisma.plan.findFirst({ where: { isActive: true }, select: { id: true, slug: true } });

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name, slug, status: 'active', planId: plan?.id ?? null, internalNotes: `courtesy tenant${ownerName ? ` (${ownerName})` : ''}` }, select: { id: true, name: true, slug: true, status: true } });

      if (plan) {
        await tx.subscription.create({ data: { tenantId: tenant.id, planId: plan.id, status: 'courtesy', provider: 'courtesy', paymentRequired: false, paymentProvider: null } });
      }

      const existing = await tx.allowedUser.findUnique({ where: { email: ownerEmail } });
      if (existing) return { error: 'E-mail já autorizado em outro tenant', code: 'ALLOWED_USER_EMAIL_ALREADY_EXISTS' };

      const allowedUser = await tx.allowedUser.create({ data: { email: ownerEmail, tenantId: tenant.id, role: 'owner', status: 'active', active: true, acceptedAt: new Date(), invitedBy: session.userId }, select: { id: true, email: true, role: true, status: true, active: true } });

      await logPlatformAudit({ tenantId: tenant.id, userId: session.userId, entityType: 'courtesy', entityId: tenant.id, action: 'courtesy.tenant.created', metadata: { planSlug: plan?.slug || null, provider: 'courtesy' } });
      await logPlatformAudit({ tenantId: tenant.id, userId: session.userId, entityType: 'allowlist', entityId: allowedUser.id, action: 'courtesy.allowed_user.created', metadata: { email: ownerEmail, role: 'owner' } });

      return { tenant, allowedUser };
    });

    if ('error' in result) return NextResponse.json({ error: result.error, code: result.code }, { status: 409 });
    return NextResponse.json({ ok: true, tenant: result.tenant, allowedUser: result.allowedUser });
  } catch (error) {
    console.error('[admin/tenants/courtesy][POST]', error);
    return NextResponse.json({ error: 'Falha ao criar tenant de cortesia' }, { status: 500 });
  }
}
