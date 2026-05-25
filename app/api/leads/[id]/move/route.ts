import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission, can, canMoveLead } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { logTrackingEvent, shouldSkipDuplicate } from '@/lib/tracking';

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

    let newStatus = lead.status;
    if (newStage.name === 'Ganho') newStatus = 'won';
    else if (newStage.name === 'Perdido') newStatus = 'lost';
    else newStatus = 'open';

    await prisma.$transaction([
      prisma.lead.update({
        where: { id: lead.id },
        data: { stageId, status: newStatus },
      }),
      prisma.leadStageHistory.create({
        data: { leadId: lead.id, fromStageId: lead.stageId, toStageId: stageId, changedBy: session.userId },
      }),
    ]);



    const mappings = await prisma.kanbanStageTrackingEvent.findMany({ where: { tenantId: session.tenantId, stageId, enabled: true } });
    const trackingEvents: Array<{ provider: string; eventName: string; payload: Record<string, unknown>; eventId: string; skipped?: boolean }> = [];
    for (const m of mappings) {
      const eventName = m.customEventName || m.eventName;
      const skip = await shouldSkipDuplicate({ tenantId: session.tenantId, leadId: lead.id, toStageId: stageId, provider: m.provider, eventName });
      if (skip) {
        await logTrackingEvent({ tenantId: session.tenantId, leadId: lead.id, pipelineId: lead.pipelineId, fromStageId: lead.stageId, toStageId: stageId, provider: m.provider, eventName, status: 'skipped', reason: 'duplicate', triggeredById: session.userId });
        trackingEvents.push({ provider: m.provider, eventName, payload: { content_category: 'kanban', currency: 'BRL' }, eventId: crypto.randomUUID(), skipped: true });
        continue;
      }
      const eventId = crypto.randomUUID();
      await logTrackingEvent({ tenantId: session.tenantId, leadId: lead.id, pipelineId: lead.pipelineId, fromStageId: lead.stageId, toStageId: stageId, provider: m.provider, eventName, status: 'queued', triggeredById: session.userId, eventId });
      trackingEvents.push({ provider: m.provider, eventName, payload: { content_name: newStage.name, content_category: 'kanban', currency: 'BRL' }, eventId });
    }

    await logAudit({
      tenantId: session.tenantId, userId: session.userId,
      entityType: 'lead', entityId: lead.id, action: 'lead.moved',
      metadata: { fromStageId: lead.stageId, toStageId: stageId, newStatus },
    });

    return NextResponse.json({ ok: true, trackingEvents });
  } catch (e) {
    console.error('move lead error', e);
    return NextResponse.json({ error: 'Erro ao mover lead' }, { status: 500 });
  }
});
