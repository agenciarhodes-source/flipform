import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { dashboardQuerySchema, getDashboardMetrics } from '@/lib/dashboard-metrics';

export const GET = withPermission('DASHBOARD_VIEW', async (req: NextRequest, session) => {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = dashboardQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const dashboard = await getDashboardMetrics(prisma, session.tenantId, session.userId, session.role, parsed.data);
    return NextResponse.json(dashboard);
  } catch (error: any) {
    if (error?.message === 'FORM_NOT_FOUND' || error?.message === 'PIPELINE_NOT_FOUND') {
      return NextResponse.json({ error: 'Filtro inválido para este tenant.' }, { status: 404 });
    }
    console.error('dashboard.metrics error', error);
    return NextResponse.json({ error: 'Não foi possível carregar o Dashboard. Tente novamente.' }, { status: 500 });
  }
});
