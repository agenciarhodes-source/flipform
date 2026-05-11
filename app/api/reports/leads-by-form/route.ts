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
    by: ['formId'],
    where: ctx.leadsWhere,
    _count: { _all: true },
  });
  const formIds = grouped.map((g) => g.formId).filter(Boolean) as string[];
  const forms = formIds.length
    ? await prisma.form.findMany({
        where: { id: { in: formIds }, tenantId: ctx.tenantId },
        select: { id: true, name: true, slug: true },
      })
    : [];

  // total + ganhos por form
  const wonByForm = await prisma.lead.groupBy({
    by: ['formId'],
    where: { ...ctx.leadsWhere, status: 'won' },
    _count: { _all: true },
  });
  const wonMap = new Map(wonByForm.map((g) => [g.formId, g._count._all]));

  const data = grouped.map((g) => {
    const f = g.formId ? forms.find((x) => x.id === g.formId) : null;
    const total = g._count._all;
    const won = wonMap.get(g.formId) || 0;
    return {
      formId: g.formId,
      name: f ? f.name : '(sem formulário)',
      slug: f?.slug || null,
      total,
      won,
      conversionRate: total > 0 ? Math.round((won / total) * 100) : 0,
    };
  }).sort((a, b) => b.total - a.total);
  return NextResponse.json({ data });
});
