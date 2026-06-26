import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { buildReportContext, validateFiltersBelongToTenant } from '@/lib/reports-helpers';
import { formatLeadSource } from '@/lib/leads';

export const GET = withPermission('REPORTS_VIEW', async (req, session) => {
  const { searchParams } = new URL(req.url);
  const built = buildReportContext(session, searchParams);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
  const ctx = built.ctx;
  const err = await validateFiltersBelongToTenant(ctx);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const grouped = await prisma.lead.groupBy({
    by: ['source'],
    where: ctx.leadsWhere,
    _count: { _all: true },
  });
  type SourceRow = { source: string; _count: { _all: number } };
  const data = (grouped as SourceRow[])
    .map((g) => ({ source: formatLeadSource(g.source), count: g._count._all }))
    .sort((a, b) => b.count - a.count);
  return NextResponse.json({ data });
});
