import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth';
import { assertCanAccessLead, canCompleteTask } from '@/lib/rbac-server';
import {
  FlipAiHumanActionRequestError,
  resolveFlipAiHumanActionRequest,
} from '@/lib/flip-ai/human-action-request';

const bodySchema = z.object({
  taskId: z.string().uuid(),
  action: z.enum(['confirm', 'decline', 'reopen']),
  note: z.string().trim().max(500).optional().nullable(),
}).strict();

export const PATCH = withAuth(async (
  req: NextRequest,
  session,
  ctx: { params: { id: string } },
) => {
  const lead = await prisma.lead.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    select: { id: true, assignedTo: true },
  });
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });

  try {
    assertCanAccessLead(session, lead);
  } catch {
    return NextResponse.json({ error: 'Você não tem permissão para acessar este lead.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' }, { status: 400 });
  }

  const task = await prisma.task.findFirst({
    where: {
      id: parsed.data.taskId,
      tenantId: session.tenantId,
      leadId: lead.id,
    },
    select: { id: true, assignedTo: true, createdBy: true },
  });
  if (!task) return NextResponse.json({ error: 'Solicitação interna não encontrada.' }, { status: 404 });

  const allowed = canCompleteTask(session.role, {
    task: { assignedTo: task.assignedTo, createdBy: task.createdBy },
    lead: { assignedTo: lead.assignedTo },
  }, session.userId);
  if (!allowed) {
    return NextResponse.json({ error: 'Sem permissão para resolver esta solicitação.' }, { status: 403 });
  }

  try {
    const updated = await resolveFlipAiHumanActionRequest({
      tenantId: session.tenantId,
      leadId: lead.id,
      taskId: task.id,
      userId: session.userId,
      action: parsed.data.action,
      note: parsed.data.note,
    });
    return NextResponse.json({
      ok: true,
      task: {
        id: updated.id,
        status: updated.status,
        completedAt: updated.completedAt,
      },
    });
  } catch (error) {
    if (error instanceof FlipAiHumanActionRequestError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: 'Não foi possível atualizar a solicitação.' }, { status: 500 });
  }
});
