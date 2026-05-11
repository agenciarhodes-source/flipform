import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { stageCreateSchema } from '@/lib/schemas-pipelines';

export const POST = withPermission('PIPELINES_EDIT', async (req, session, ctx: { params: { id: string } }) => {
  const body = await req.json();
  const parsed = stageCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const pipeline = await prisma.pipeline.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    include: { stages: { orderBy: { orderIndex: 'desc' }, take: 1 } },
  });
  if (!pipeline) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const nextOrder = (pipeline.stages[0]?.orderIndex ?? -1) + 1;
  const stage = await prisma.pipelineStage.create({
    data: {
      pipelineId: pipeline.id,
      name: parsed.data.name,
      color: parsed.data.color || '#3B82F6',
      orderIndex: nextOrder,
    },
  });

  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'stage', entityId: stage.id, action: 'stage.created',
    metadata: { name: stage.name, pipelineId: pipeline.id },
  });

  return NextResponse.json({ stage });
});
