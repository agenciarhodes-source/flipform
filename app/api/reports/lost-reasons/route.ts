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

  const grouped = await prisma.lead.groupBy({
    by: ['lostReason'],
    where: { ...ctx.leadsWhere, status: 'lost' },
    _count: { _all: true },
  });
  const data = grouped
    .map((g: {lostReason: string | null; _count: {_all: number}}) => ({ reason: g.lostReason || 'Não informado', count: g._count._all }))
    .sort((a: {count: number}, b: {count: number}) => b.count - a.count);
  return NextResponse.json({ data });
});
