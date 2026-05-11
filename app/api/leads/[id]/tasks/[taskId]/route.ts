import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth';
import { can, canEditTask, canDeleteTask, canCompleteTask } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { taskUpdateSchema } from '@/lib/schemas-tasks';

// PUT /api/leads/[id]/tasks/[taskId] - atualizar tarefa
export const PUT = withAuth(async (req, session, ctx: { params: { id: string; taskId: string } }) => {
  if (!can(session.role, 'TASKS_VIEW')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const task = await prisma.task.findFirst({
    where: { id: ctx.params.taskId, tenantId: session.tenantId, leadId: ctx.params.id },
    include: { lead: { select: { id: true, assignedTo: true, name: true } } },
  });
  if (!task) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });
  if (task.lead?.id !== ctx.params.id) {
    return NextResponse.json({ error: 'Tarefa não pertence a este lead' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = taskUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }
  const data = parsed.data;

  // Permissão geral de editar
  const scope = {
    task: { assignedTo: task.assignedTo, createdBy: task.createdBy },
    lead: task.lead ? { assignedTo: task.lead.assignedTo } : null,
  };

  const isStatusOnlyChange = data.status !== undefined && Object.keys(data).length === 1;

  if (isStatusOnlyChange) {
    if (!canCompleteTask(session.role, scope, session.userId)) {
      return NextResponse.json({ error: 'Sem permissão para alterar status desta tarefa.' }, { status: 403 });
    }
  } else {
    if (!canEditTask(session.role, scope, session.userId)) {
      return NextResponse.json({ error: 'Sem permissão para editar esta tarefa.' }, { status: 403 });
    }
  }

  // Reatribuir somente quem tem TASKS_ASSIGN
  if (data.assignedTo !== undefined && data.assignedTo !== task.assignedTo) {
    const targetIsSelfOrNull = !data.assignedTo || data.assignedTo === session.userId;
    if (!targetIsSelfOrNull && !can(session.role, 'TASKS_ASSIGN')) {
      return NextResponse.json({ error: 'Sem permissão para reatribuir a outro usuário.' }, { status: 403 });
    }
    if (data.assignedTo) {
      const tu = await prisma.tenantUser.findFirst({
        where: { tenantId: session.tenantId, userId: data.assignedTo, status: 'active' },
      });
      if (!tu) return NextResponse.json({ error: 'Responsável inválido para este tenant.' }, { status: 400 });
    }
  }

  const updateData: any = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.assignedTo !== undefined) updateData.assignedTo = data.assignedTo;

  let actionLog: string | null = null;
  if (data.status !== undefined && data.status !== task.status) {
    if (data.status === 'completed') {
      updateData.status = 'completed';
      updateData.completedAt = new Date();
      actionLog = 'task.completed';
    } else if (data.status === 'pending') {
      updateData.status = 'pending';
      updateData.completedAt = null;
      actionLog = 'task.reopened';
    }
  }

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: updateData,
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      creator: { select: { id: true, name: true, email: true } },
    },
  });

  // Audit
  if (actionLog) {
    await logAudit({
      tenantId: session.tenantId, userId: session.userId,
      entityType: 'task', entityId: task.id, action: actionLog,
      metadata: { leadId: task.leadId, title: updated.title },
    });
  } else {
    const changed = Object.keys(updateData);
    if (changed.length > 0) {
      await logAudit({
        tenantId: session.tenantId, userId: session.userId,
        entityType: 'task', entityId: task.id, action: 'task.updated',
        metadata: { leadId: task.leadId, changes: changed },
      });
    }
  }
  if (data.assignedTo !== undefined && data.assignedTo !== task.assignedTo) {
    await logAudit({
      tenantId: session.tenantId, userId: session.userId,
      entityType: 'task', entityId: task.id, action: 'task.assigned',
      metadata: { leadId: task.leadId, from: task.assignedTo, to: data.assignedTo },
    });
  }

  return NextResponse.json({ task: updated });
});

// DELETE /api/leads/[id]/tasks/[taskId]
export const DELETE = withAuth(async (_req, session, ctx: { params: { id: string; taskId: string } }) => {
  if (!can(session.role, 'TASKS_VIEW')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const task = await prisma.task.findFirst({
    where: { id: ctx.params.taskId, tenantId: session.tenantId, leadId: ctx.params.id },
    include: { lead: { select: { id: true, assignedTo: true } } },
  });
  if (!task) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });

  const scope = {
    task: { assignedTo: task.assignedTo, createdBy: task.createdBy },
    lead: task.lead ? { assignedTo: task.lead.assignedTo } : null,
  };
  if (!canDeleteTask(session.role, scope, session.userId)) {
    return NextResponse.json({ error: 'Sem permissão para excluir esta tarefa.' }, { status: 403 });
  }

  await prisma.task.delete({ where: { id: task.id } });
  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'task', entityId: task.id, action: 'task.deleted',
    metadata: { leadId: task.leadId, title: task.title },
  });
  return NextResponse.json({ ok: true });
});
