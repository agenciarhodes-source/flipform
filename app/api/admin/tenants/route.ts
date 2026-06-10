import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';

export const GET = withPlatformAdmin(async (req) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const q = searchParams.get('q');

  type TenantWhere = {
    status?: string;
    OR?: Array<{ name?: { contains: string; mode: 'insensitive' }; slug?: { contains: string; mode: 'insensitive' } }>;
  };

  const where: TenantWhere = {};
  if (status && status !== 'all') where.status = status;
  if (q) where.OR = [
    { name: { contains: q, mode: 'insensitive' } },
    { slug: { contains: q, mode: 'insensitive' } },
  ];

  const tenants = await prisma.tenant.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      plan: { select: { id: true, name: true, price: true } },
      _count: { select: { tenantUsers: true, leads: true, forms: true } },
    },
  });

  type TenantRow = typeof tenants[number];

  return NextResponse.json({
    tenants: (tenants as TenantRow[]).map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      logoUrl: t.logoUrl,
      primaryColor: t.primaryColor,
      status: t.status,
      planId: t.planId,
      planName: t.plan?.name || null,
      planPrice: t.plan ? Number(t.plan.price) : null,
      nextDueDate: t.nextDueDate,
      lastLoginAt: t.lastLoginAt,
      createdAt: t.createdAt,
      usersCount: t._count.tenantUsers,
      leadsCount: t._count.leads,
      formsCount: t._count.forms,
    })),
  });
});
