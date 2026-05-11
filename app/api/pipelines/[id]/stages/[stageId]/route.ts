import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { stageUpdateSchema } from '@/lib/schemas-pipelines';

async function findOwnStage(stageId: string, pipelineId: string, tenantId: string) {
  return prisma.pipelineStage.findFirst({
    where: { id: stageId, pipelineId, pipeline: { tenantId } },
    include: { _count: { select: { leads: true, formsAsInitial: true } } },
  });
}

export const PUT = withPermission('PIPELINES_EDIT', async (req, session, ctx: { params: { id: string; stageId: string } }) => {
  const stage = await findOwnStage(ctx.params.stageId, ctx.params.id, session.tenantId);
  if (!stage) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const body = await req.json();
  const parsed = stageUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  // Antes de arquivar, validar que sobra pelo menos 1 ativa no pipeline
  if (parsed.data.isArchived === true && !stage.isArchived) {
    const remainingActive = await prisma.pipelineStage.count({
      where: { pipelineId: ctx.params.id, isArchived: false, id: { not: stage.id } },
    });
    if (remainingActive < 1) {
      return NextResponse.json({ error: 'Não é possível arquivar a única etapa ativa.' }, { status: 400 });
    }
    if (stage._count.leads > 0) {
      return NextResponse.json({ error: `Existem ${stage._count.leads} leads nesta etapa. Mova-os antes de arquivar.` }, { status: 409 });
    }
  }

  const updates: any = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;
  if (parsed.data.isArchived !== undefined) updates.isArchived = parsed.data.isArchived;

  await prisma.pipelineStage.update({ where: { id: stage.id }, data: updates });

  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'stage', entityId: stage.id,
    action: updates.isArchived === true ? 'stage.archived' : (updates.isArchived === false ? 'stage.unarchived' : 'stage.updated'),
    metadata: { changes: updates, pipelineId: ctx.params.id },
  });

  return NextResponse.json({ ok: true });
});

export const DELETE = withPermission('PIPELINES_EDIT', async (_req, session, ctx: { params: { id: string; stageId: string } }) => {
  const stage = await findOwnStage(ctx.params.stageId, ctx.params.id, session.tenantId);
  if (!stage) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  if (stage._count.leads > 0) {
    return NextResponse.json({ error: `Existem ${stage._count.leads} leads nesta etapa. Mova-os antes de excluir.` }, { status: 409 });
  }
  if (stage._count.formsAsInitial > 0) {
    return NextResponse.json({ error: `Esta etapa é inicial de ${stage._count.formsAsInitial} formulário(s).` }, { status: 409 });
  }

  // Impedir deletar a única etapa ativa restante
  const remainingActive = await prisma.pipelineStage.count({
    where: { pipelineId: ctx.params.id, isArchived: false, id: { not: stage.id } },
  });
  if (remainingActive < 1) {
    return NextResponse.json({ error: 'Não é possível excluir a única etapa ativa.' }, { status: 400 });
  }

  await prisma.pipelineStage.delete({ where: { id: stage.id } });

  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'stage', entityId: stage.id, action: 'stage.deleted',
    metadata: { name: stage.name, pipelineId: ctx.params.id },
  });

  return NextResponse.json({ ok: true });
});
