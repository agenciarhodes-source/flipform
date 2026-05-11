import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';

export const POST = withPermission('PIPELINES_CREATE', async (_req, session, ctx: { params: { id: string } }) => {
  const source = await prisma.pipeline.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    include: { stages: { orderBy: { orderIndex: 'asc' } } },
  });
  if (!source) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const copy = await prisma.pipeline.create({
    data: {
      tenantId: session.tenantId,
      name: `${source.name} (cópia)`,
      isDefault: false,
      isArchived: false,
      stages: {
        create: source.stages.map((s) => ({
          name: s.name, color: s.color, orderIndex: s.orderIndex, isArchived: s.isArchived,
        })),
      },
    },
    include: { stages: { orderBy: { orderIndex: 'asc' } } },
  });

  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'pipeline', entityId: copy.id, action: 'pipeline.created',
    metadata: { name: copy.name, duplicatedFrom: source.id },
  });

  return NextResponse.json({ pipeline: copy });
});
