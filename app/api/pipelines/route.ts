import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { pipelineCreateSchema } from '@/lib/schemas-pipelines';

export const GET = withPermission('PIPELINES_VIEW', async (req, session) => {
  const { searchParams } = new URL(req.url);
  const includeArchived = searchParams.get('includeArchived') === '1';
  const pipelines = await prisma.pipeline.findMany({
    where: { tenantId: session.tenantId, ...(includeArchived ? {} : { isArchived: false }) },
    include: {
      stages: { orderBy: { orderIndex: 'asc' }, include: { _count: { select: { leads: true, formsAsInitial: true } } } },
      _count: { select: { leads: true, forms: true } },
    },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json({ pipelines });
});

export const POST = withPermission('PIPELINES_CREATE', async (req, session) => {
  try {
    const body = await req.json();
    const parsed = pipelineCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

    const pipeline = await prisma.pipeline.create({
      data: {
        tenantId: session.tenantId,
        name: parsed.data.name,
        isDefault: false,
        stages: {
          create: [
            { name: 'Novo lead', color: '#3B82F6', orderIndex: 0 },
            { name: 'Em andamento', color: '#F59E0B', orderIndex: 1 },
            { name: 'Ganho', color: '#10B981', orderIndex: 2 },
          ],
        },
      },
      include: { stages: { orderBy: { orderIndex: 'asc' } } },
    });

    await logAudit({
      tenantId: session.tenantId, userId: session.userId,
      entityType: 'pipeline', entityId: pipeline.id, action: 'pipeline.created',
      metadata: { name: pipeline.name },
    });

    return NextResponse.json({ pipeline });
  } catch (e) {
    console.error('pipeline.create error', e);
    return NextResponse.json({ error: 'Erro ao criar pipeline' }, { status: 500 });
  }
});
