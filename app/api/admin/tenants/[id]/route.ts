import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';

export const GET = withPlatformAdmin(async (_req, _session, ctx: { params: { id: string } }) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.params.id },
    include: {
      plan: true,
      tenantUsers: { include: { user: { select: { id: true, name: true, email: true, createdAt: true } } }, orderBy: { createdAt: 'asc' } },
      forms: { select: { id: true, name: true, slug: true, isActive: true, createdAt: true } },
      pipelines: { select: { id: true, name: true, isDefault: true, isArchived: true } },
      statusHistory: { include: { changer: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 30 },
      subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' } },
      payments: { orderBy: { createdAt: 'desc' }, take: 20 },
      _count: { select: { leads: true } },
    },
  });
  if (!tenant) return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 });
  return NextResponse.json({ tenant: {
    ...tenant,
    leadsCount: tenant._count.leads,
    plan: tenant.plan ? { ...tenant.plan, price: Number(tenant.plan.price) } : null,
    payments: (tenant.payments as Array<{ value: unknown; [key: string]: unknown }>).map((p) => ({ ...p, value: Number(p.value) })),
  } });
});
