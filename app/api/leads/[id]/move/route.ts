import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission, can, canMoveLead } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';

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

    if (lead.stageId === stageId) {
      return NextResponse.json({ ok: true });
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

    await logAudit({
      tenantId: session.tenantId, userId: session.userId,
      entityType: 'lead', entityId: lead.id, action: 'lead.moved',
      metadata: { fromStageId: lead.stageId, toStageId: stageId, newStatus },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('move lead error', e);
    return NextResponse.json({ error: 'Erro ao mover lead' }, { status: 500 });
  }
});
