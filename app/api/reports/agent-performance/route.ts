import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { buildReportContext, validateFiltersBelongToTenant } from '@/lib/reports-helpers';

export const GET = withPermission('REPORTS_VIEW', async (req, session) => {
  const { searchParams } = new URL(req.url);
  const built = buildReportContext(session, searchParams);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
  const ctx = built.ctx;
  const err = await validateFiltersBelongToTenant(ctx);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const [byAgent, wonByAgent, lostByAgent] = await Promise.all([
    prisma.lead.groupBy({ by: ['assignedTo'], where: ctx.leadsWhere, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ['assignedTo'], where: { ...ctx.leadsWhere, status: 'won' }, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ['assignedTo'], where: { ...ctx.leadsWhere, status: 'lost' }, _count: { _all: true } }),
  ]);

  const userIds = byAgent.map((g) => g.assignedTo).filter(Boolean) as string[];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds }, tenantUsers: { some: { tenantId: ctx.tenantId } } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const wonMap = new Map(wonByAgent.map((g) => [g.assignedTo, g._count._all]));
  const lostMap = new Map(lostByAgent.map((g) => [g.assignedTo, g._count._all]));

  const data = byAgent.map((g) => {
    const u = g.assignedTo ? users.find((x) => x.id === g.assignedTo) : null;
    const total = g._count._all;
    const won = wonMap.get(g.assignedTo) || 0;
    const lost = lostMap.get(g.assignedTo) || 0;
    return {
      userId: g.assignedTo,
      name: u ? u.name : '(sem responsável)',
      email: u?.email || null,
      total,
      won,
      lost,
      conversionRate: total > 0 ? Math.round((won / total) * 100) : 0,
    };
  }).sort((a, b) => b.total - a.total);
  return NextResponse.json({ data });
});
