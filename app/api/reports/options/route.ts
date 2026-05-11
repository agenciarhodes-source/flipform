import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';

/**
 * Endpoint auxiliar que retorna os valores poss\u00edveis para popular os filtros
 * do dashboard de relat\u00f3rios. Sempre filtrado por tenant.
 */
export const GET = withPermission('REPORTS_VIEW', async (_req, session) => {
  const [pipelines, forms, users, sources] = await Promise.all([
    prisma.pipeline.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isArchived: true },
    }),
    prisma.form.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, isActive: true },
    }),
    prisma.tenantUser.findMany({
      where: { tenantId: session.tenantId, status: 'active' },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: 'asc' } },
    }),
    prisma.lead.groupBy({
      by: ['source'],
      where: { tenantId: session.tenantId },
      _count: { _all: true },
      orderBy: { _count: { source: 'desc' } },
    }),
  ]);

  return NextResponse.json({
    pipelines,
    forms,
    users: users.map((tu) => ({ id: tu.user.id, name: tu.user.name, email: tu.user.email, role: tu.role })),
    sources: sources.map((s) => ({ value: s.source, count: s._count._all })),
  });
});
