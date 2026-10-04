import type { Prisma } from '@prisma/client';
import { Role, TenantStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';

export const GET = withPlatformAdmin(async (req) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const q = searchParams.get('q');

  const tenantStatuses = Object.values(TenantStatus) as string[];

  const where: Prisma.TenantWhereInput = {};
  if (status && status !== 'all' && tenantStatuses.includes(status)) {
    where.status = status as TenantStatus;
  }
  if (q) where.OR = [
    { name: { contains: q, mode: 'insensitive' } },
    { slug: { contains: q, mode: 'insensitive' } },
    {
      tenantUsers: {
        some: {
          role: Role.owner,
          user: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      },
    },
  ];

  const tenants = await prisma.tenant.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      plan: { select: { id: true, name: true, price: true } },
      tenantUsers: {
        where: { role: Role.owner },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          status: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
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
      owners: t.tenantUsers.map((tenantUser) => ({
        tenantUserId: tenantUser.id,
        userId: tenantUser.user.id,
        name: tenantUser.user.name,
        email: tenantUser.user.email,
        status: tenantUser.status,
        createdAt: tenantUser.createdAt,
      })),
      usersCount: t._count.tenantUsers,
      leadsCount: t._count.leads,
      formsCount: t._count.forms,
    })),
  });
});
