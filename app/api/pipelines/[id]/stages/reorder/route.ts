import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { stagesReorderSchema } from '@/lib/schemas-pipelines';

export const POST = withPermission('PIPELINES_REORDER', async (req, session, ctx: { params: { id: string } }) => {
  const body = await req.json();
  const parsed = stagesReorderSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const pipeline = await prisma.pipeline.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!pipeline) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  // Validar que TODOS os ids pertencem a este pipeline (impede cross-tenant)
  const stages = await prisma.pipelineStage.findMany({
    where: { pipelineId: pipeline.id, id: { in: parsed.data.stageIds } },
    select: { id: true },
  });
  if (stages.length !== parsed.data.stageIds.length) {
    return NextResponse.json({ error: 'Etapa(s) inválida(s).' }, { status: 400 });
  }

  // Bulk update via transaction
  await prisma.$transaction(
    parsed.data.stageIds.map((id, idx) =>
      prisma.pipelineStage.update({ where: { id }, data: { orderIndex: idx } }),
    ),
  );

  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'pipeline', entityId: pipeline.id, action: 'stage.reordered',
    metadata: { stageIds: parsed.data.stageIds },
  });

  return NextResponse.json({ ok: true });
});
