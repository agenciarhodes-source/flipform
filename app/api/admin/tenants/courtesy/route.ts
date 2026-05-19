import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';

async function requirePlatformAdmin() {
  const session = await getSession();
  if (!session || session.globalRole !== 'platform_admin') return null;
  return session;
}

export async function POST(req: Request) {
  const session = await requirePlatformAdmin();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const slug = String(body.slug || '').trim().toLowerCase();
  const ownerEmail = String(body.ownerEmail || '').trim().toLowerCase();
  const ownerName = String(body.ownerName || '').trim();
  const requestedPlanSlug = String(body.planSlug || 'growth').trim().toLowerCase() || 'growth';

  if (!name) return NextResponse.json({ error: 'Nome do tenant é obrigatório' }, { status: 400 });
  if (!slug) return NextResponse.json({ error: 'Slug é obrigatório' }, { status: 400 });
  if (!ownerEmail) return NextResponse.json({ error: 'E-mail do owner é obrigatório' }, { status: 400 });

  const existsTenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (existsTenant) return NextResponse.json({ error: 'Slug já está em uso' }, { status: 409 });

  const plan = await prisma.plan.findFirst({
    where: { slug: requestedPlanSlug, isActive: true },
    select: { id: true, slug: true },
  }) || await prisma.plan.findFirst({ where: { slug: 'growth', isActive: true }, select: { id: true, slug: true } });

  if (!plan) return NextResponse.json({ error: 'Nenhum plano disponível para cortesia' }, { status: 400 });

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

    const subscription = await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: 'courtesy',
        provider: 'courtesy',
        paymentRequired: false,
        paymentProvider: null,
      },
      select: { id: true },
    });

    const existing = await tx.allowedUser.findUnique({ where: { email: ownerEmail } });
    if (existing) throw new Error('E-mail já autorizado em outro tenant');

    const allowedUser = await tx.allowedUser.create({
      data: {
        email: ownerEmail,
        tenantId: tenant.id,
        role: 'owner',
        status: 'active',
        active: true,
        acceptedAt: new Date(),
        invitedBy: session.userId,
      },
      select: { id: true, email: true, role: true, status: true, active: true },
    });

    await logPlatformAudit({ tenantId: tenant.id, userId: session.userId, entityType: 'courtesy', entityId: tenant.id, action: 'courtesy.tenant.created', metadata: { planSlug: plan.slug, subscriptionId: subscription.id, provider: 'courtesy' } });
    await logPlatformAudit({ tenantId: tenant.id, userId: session.userId, entityType: 'allowlist', entityId: allowedUser.id, action: 'courtesy.allowed_user.created', metadata: { email: ownerEmail, role: 'owner' } });

    return { tenant, allowedUser };
  }).catch((error) => {
    if (error instanceof Error && error.message.includes('E-mail já autorizado')) return { error: error.message };
    throw error;
  });

  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 409 });

  return NextResponse.json({ ok: true, tenant: result.tenant, allowedUser: result.allowedUser });
}
