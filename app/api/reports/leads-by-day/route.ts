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

  const leads = await prisma.lead.findMany({
    where: ctx.leadsWhere,
    select: { createdAt: true, status: true },
    orderBy: { createdAt: 'asc' },
  });

  const buckets: Record<string, { date: string; total: number; ganhos: number; perdidos: number }> = {};
  const start = new Date(ctx.from.getFullYear(), ctx.from.getMonth(), ctx.from.getDate());
  const end = new Date(ctx.to.getFullYear(), ctx.to.getMonth(), ctx.to.getDate());
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
    const key = d.toISOString().slice(0, 10);
    buckets[key] = { date: key, total: 0, ganhos: 0, perdidos: 0 };
  }
  for (const l of leads) {
    const key = l.createdAt.toISOString().slice(0, 10);
    if (!buckets[key]) buckets[key] = { date: key, total: 0, ganhos: 0, perdidos: 0 };
    buckets[key].total += 1;
    if (l.status === 'won') buckets[key].ganhos += 1;
    else if (l.status === 'lost') buckets[key].perdidos += 1;
  }
  const data = Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date)).map((b) => ({
    ...b,
    label: b.date.slice(5).replace('-', '/'),
  }));
  return NextResponse.json({ data });
});
