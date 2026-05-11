import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { pipelineUpdateSchema } from '@/lib/schemas-pipelines';

export const GET = withPermission('PIPELINES_VIEW', async (_req, session, ctx: { params: { id: string } }) => {
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    include: {
      stages: { orderBy: { orderIndex: 'asc' }, include: { _count: { select: { leads: true, formsAsInitial: true } } } },
      _count: { select: { leads: true, forms: true } },
    },
  });
  if (!pipeline) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  return NextResponse.json({ pipeline });
});

export const PUT = withPermission('PIPELINES_EDIT', async (req, session, ctx: { params: { id: string } }) => {
  const body = await req.json();
  const parsed = pipelineUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const pipeline = await prisma.pipeline.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!pipeline) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  // Set as default: garantir que outros pipelines do tenant deixem de ser default
  if (parsed.data.isDefault === true && !pipeline.isDefault) {
    await prisma.$transaction([
      prisma.pipeline.updateMany({ where: { tenantId: session.tenantId, isDefault: true }, data: { isDefault: false } }),
      prisma.pipeline.update({ where: { id: pipeline.id }, data: { isDefault: true, isArchived: false } }),
    ]);
    await logAudit({
      tenantId: session.tenantId, userId: session.userId,
      entityType: 'pipeline', entityId: pipeline.id, action: 'pipeline.default_changed',
      metadata: { name: pipeline.name },
    });
  }

  // Não permitir arquivar o pipeline padrão sem trocar antes
  if (parsed.data.isArchived === true && pipeline.isDefault) {
    return NextResponse.json({ error: 'Não é possível arquivar o pipeline padrão. Defina outro como padrão antes.' }, { status: 400 });
  }

  const updates: any = {};
  if (parsed.data.name) updates.name = parsed.data.name;
  if (parsed.data.isArchived !== undefined) updates.isArchived = parsed.data.isArchived;
  if (Object.keys(updates).length) {
    await prisma.pipeline.update({ where: { id: pipeline.id }, data: updates });
    await logAudit({
      tenantId: session.tenantId, userId: session.userId,
      entityType: 'pipeline', entityId: pipeline.id,
      action: updates.isArchived === true ? 'pipeline.archived' : (updates.isArchived === false ? 'pipeline.unarchived' : 'pipeline.updated'),
      metadata: { changes: updates },
    });
  }

  return NextResponse.json({ ok: true });
});

export const DELETE = withPermission('PIPELINES_DELETE', async (_req, session, ctx: { params: { id: string } }) => {
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    include: { _count: { select: { leads: true, forms: true } } },
  });
  if (!pipeline) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if (pipeline.isDefault) return NextResponse.json({ error: 'Não é possível excluir o pipeline padrão.' }, { status: 400 });
  if (pipeline._count.leads > 0) return NextResponse.json({ error: `Existem ${pipeline._count.leads} leads vinculados. Mova-os antes de excluir.` }, { status: 409 });
  if (pipeline._count.forms > 0) return NextResponse.json({ error: `Existem ${pipeline._count.forms} formulários usando este pipeline.` }, { status: 409 });

  await prisma.pipeline.delete({ where: { id: pipeline.id } });
  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'pipeline', entityId: pipeline.id, action: 'pipeline.deleted',
    metadata: { name: pipeline.name },
  });
  return NextResponse.json({ ok: true });
});
