import type { Prisma } from '@prisma/client';
import { Role, TenantStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';
import { getClientFlipAiSummaries, resolveClientFlipAiSummary } from '@/lib/admin/client-flip-ai-summary';
import { getClientTenantWhere } from '@/lib/admin/client-tenant-filter';
import { isTenantAccountKind } from '@/lib/admin/tenant-account-kind';

// A company is represented by its owner. Companies without one (for example
// stores run only by managers) fall back to the highest role they have.
const RESPONSIBLE_ROLES: Role[] = [Role.owner, Role.admin, Role.manager];

function pickResponsibles<T extends { role: Role }>(users: T[]): T[] {
  for (const role of RESPONSIBLE_ROLES) {
    const matching = users.filter((user) => user.role === role);
    if (matching.length > 0) return matching;
  }
  return [];
}

export const GET = withPlatformAdmin(async (req) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const q = searchParams.get('q');

  const tenantStatuses = Object.values(TenantStatus) as string[];

  const clientsOnly = searchParams.get('clientsOnly') === 'true';
  const clientWhere = getClientTenantWhere();
  const kind = searchParams.get('kind');
  // An explicit kind wins; otherwise `clientsOnly` keeps the customer-only view.
  const clientFilters: Prisma.TenantWhereInput[] = isTenantAccountKind(kind)
    ? [{ accountKind: kind }]
    : clientsOnly ? [clientWhere] : [];

  if (q) {
    clientFilters.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
        {
          tenantUsers: {
            some: {
              role: { in: RESPONSIBLE_ROLES },
              user: {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { email: { contains: q, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      ],
    });
  }

  const where: Prisma.TenantWhereInput = {
    AND: clientFilters,
  };
  if (status && status !== 'all' && tenantStatuses.includes(status)) {
    where.status = status as TenantStatus;
  }

  const tenants = await prisma.tenant.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      plan: { select: { id: true, name: true, price: true } },
      tenantUsers: {
        where: { role: { in: RESPONSIBLE_ROLES } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
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

  // Wallet and consumption are aggregated per company, never per login.
  const flipAiSummaries = await getClientFlipAiSummaries(tenants.map((tenant) => tenant.id));

  return NextResponse.json({
    tenants: (tenants as TenantRow[]).map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      logoUrl: t.logoUrl,
      primaryColor: t.primaryColor,
      status: t.status,
      accountKind: t.accountKind,
      planId: t.planId,
      planName: t.plan?.name || null,
      planPrice: t.plan ? Number(t.plan.price) : null,
      nextDueDate: t.nextDueDate,
      lastLoginAt: t.lastLoginAt,
      createdAt: t.createdAt,
      owners: pickResponsibles(t.tenantUsers).map((tenantUser) => ({
        tenantUserId: tenantUser.id,
        role: tenantUser.role,
        userId: tenantUser.user.id,
        name: tenantUser.user.name,
        email: tenantUser.user.email,
        status: tenantUser.status,
        createdAt: tenantUser.createdAt,
      })),
      usersCount: t._count.tenantUsers,
      leadsCount: t._count.leads,
      formsCount: t._count.forms,
      flipAi: resolveClientFlipAiSummary(flipAiSummaries, t.id),
    })),
  });
});
