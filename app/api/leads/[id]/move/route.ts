import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission, canMoveLead } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { dispatchKanbanStageTracking } from '@/lib/tracking';

export const POST = withPermission('LEADS_MOVE', async (req, session, ctx: { params: { id: string } }) => {
  try {
    const { stageId } = await req.json();
    if (!stageId) return NextResponse.json({ error: 'stageId obrigatório' }, { status: 400 });

    const lead = await prisma.lead.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
    if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

    if (!canMoveLead(session.role, lead, session.userId)) {
      return NextResponse.json({ error: 'Sem permissão para mover este lead.' }, { status: 403 });
    }

    const newStage = await prisma.pipelineStage.findFirst({
      where: { id: stageId, pipeline: { tenantId: session.tenantId } },
    });
    if (!newStage) return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 });

    // Bloquear etapas arquivadas
    if ((newStage as any).isArchived) {
      return NextResponse.json({ error: 'Esta etapa está arquivada. Reative-a antes de mover leads.' }, { status: 400 });
    }

    if (lead.stageId === stageId) {
      return NextResponse.json({ ok: true, trackingEvents: [] });
    }

    const finalStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId: newStage.pipelineId, isArchived: false, pipeline: { tenantId: session.tenantId } },
      orderBy: { orderIndex: 'desc' },
      select: { id: true },
    });
    const isMovingToFinalStage = finalStage?.id === stageId;

    let newStatus = lead.status;
    let newTemperature = lead.temperature;
    let automationMessage: string | null = null;
    if (isMovingToFinalStage) {
      newStatus = 'won';
      newTemperature = 'hot';
      automationMessage = 'Lead marcado como ganho ao chegar na etapa final.';
    } else if (newStage.name === 'Perdido') newStatus = 'lost';
    else if (lead.status === 'won') newStatus = 'open';
    else newStatus = 'open';

    await prisma.$transaction([
      prisma.lead.update({
        where: { id: lead.id },
        data: { stageId, status: newStatus, temperature: newTemperature },
      }),
      prisma.leadStageHistory.create({
        data: { leadId: lead.id, fromStageId: lead.stageId, toStageId: stageId, changedBy: session.userId },
      }),
    ]);

    const trackingEvents = await dispatchKanbanStageTracking({
      tenantId: session.tenantId,
      leadId: lead.id,
      pipelineId: lead.pipelineId,
      fromStageId: lead.stageId,
      toStageId: stageId,
      triggeredById: session.userId,
      source: 'kanban',
      lead: { email: lead.email, phone: lead.phone, name: lead.name },
    });

    await logAudit({
      tenantId: session.tenantId, userId: session.userId,
      entityType: 'lead', entityId: lead.id, action: 'lead.moved',
      metadata: { fromStageId: lead.stageId, toStageId: stageId, newStatus, newTemperature, message: automationMessage || undefined },
    });

    return NextResponse.json({ ok: true, trackingEvents });
  } catch (e) {
    console.error('move lead error', e);
    return NextResponse.json({ error: 'Erro ao mover lead' }, { status: 500 });
  }
});
