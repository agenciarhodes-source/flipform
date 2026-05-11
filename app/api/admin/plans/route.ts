import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';

export const GET = withPlatformAdmin(async () => {
  const plans = await prisma.plan.findMany({
    orderBy: { price: 'asc' },
    include: { _count: { select: { tenants: true, subscriptions: true } } },
  });
  return NextResponse.json({
    plans: plans.map((p) => ({
      id: p.id, name: p.name, description: p.description,
      price: Number(p.price), billingCycle: p.billingCycle,
      maxUsers: p.maxUsers, maxForms: p.maxForms, maxLeads: p.maxLeads,
      isActive: p.isActive,
      tenantsCount: p._count.tenants,
      subscriptionsCount: p._count.subscriptions,
    })),
  });
});
