import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';

export const GET = withPlatformAdmin(async () => {
  const [totalTenants, activeTenants, suspended, blocked, pastDue, trial, totalUsers, totalLeads, totalForms] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { status: 'active' } }),
    prisma.tenant.count({ where: { status: 'suspended' } }),
    prisma.tenant.count({ where: { status: 'blocked' } }),
    prisma.tenant.count({ where: { status: 'past_due' } }),
    prisma.tenant.count({ where: { status: 'trial' } }),
    prisma.tenantUser.count({ where: { status: 'active' } }),
    prisma.lead.count(),
    prisma.form.count(),
  ]);

  // MRR aproximado (soma dos planos atribuídos a tenants ativos)
  const tenantsWithPlan = await prisma.tenant.findMany({
    where: { status: { in: ['active', 'past_due'] } },
    include: { plan: { select: { price: true, billingCycle: true } } },
  });

  let mrr = 0;
  for (const t of tenantsWithPlan) {
    if (!t.plan) continue;
    const p = Number(t.plan.price);
    mrr += t.plan.billingCycle === 'yearly' ? p / 12 : p;
  }

  // Últimos tenants criados
  const recentTenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { plan: { select: { name: true } } },
  });

  type RecentTenant = typeof recentTenants[number];

  return NextResponse.json({
    tenants: { total: totalTenants, active: activeTenants, suspended, blocked, pastDue, trial },
    users: totalUsers,
    leads: totalLeads,
    forms: totalForms,
    mrr: Math.round(mrr * 100) / 100,
    recentTenants: (recentTenants as RecentTenant[]).map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      planName: t.plan?.name || null,
      createdAt: t.createdAt,
    })),
  });
});
