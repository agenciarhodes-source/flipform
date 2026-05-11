import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission, can } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { taskCreateSchema } from '@/lib/schemas-tasks';

// GET /api/leads/[id]/tasks - lista tarefas do lead
export const GET = withPermission('TASKS_VIEW', async (_req, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    select: { id: true },
  });
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });

  const tasks = await prisma.task.findMany({
    where: { tenantId: session.tenantId, leadId: lead.id },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      creator: { select: { id: true, name: true, email: true } },
    },
    orderBy: [
      { status: 'asc' },         // pending first
      { dueDate: 'asc' },        // soonest first
      { createdAt: 'desc' },
    ],
  });

  return NextResponse.json({ tasks });
});

// POST /api/leads/[id]/tasks - cria tarefa
export const POST = withPermission('TASKS_CREATE', async (req, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    select: { id: true, assignedTo: true, name: true },
  });
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = taskCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }
  const data = parsed.data;

  // Agent só pode criar tarefa em lead atribuído a ele, ou para si mesmo
  if (session.role === 'agent') {
    const isLeadOwner = lead.assignedTo === session.userId;
    const assignsToSelfOrNone = !data.assignedTo || data.assignedTo === session.userId;
    if (!isLeadOwner && !assignsToSelfOrNone) {
      return NextResponse.json({ error: 'Sem permissão para criar tarefa neste lead.' }, { status: 403 });
    }
  }

  // Apenas roles com TASKS_ASSIGN podem atribuir para outros
  if (data.assignedTo && data.assignedTo !== session.userId) {
    if (!can(session.role, 'TASKS_ASSIGN')) {
      return NextResponse.json({ error: 'Sem permissão para atribuir tarefa a outro usuário.' }, { status: 403 });
    }
  }

  // Valida assignedTo pertence ao tenant
  if (data.assignedTo) {
    const tu = await prisma.tenantUser.findFirst({
      where: { tenantId: session.tenantId, userId: data.assignedTo, status: 'active' },
    });
    if (!tu) return NextResponse.json({ error: 'Usuário responsável inválido para este tenant.' }, { status: 400 });
  }

  const task = await prisma.task.create({
    data: {
      tenantId: session.tenantId,
      leadId: lead.id,
      title: data.title,
      description: data.description ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      priority: data.priority ?? 'medium',
      assignedTo: data.assignedTo ?? null,
      createdBy: session.userId,
      status: 'pending',
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      creator: { select: { id: true, name: true, email: true } },
    },
  });

  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'task', entityId: task.id, action: 'task.created',
    metadata: { leadId: lead.id, leadName: lead.name, title: task.title, priority: task.priority, assignedTo: task.assignedTo },
  });

  if (task.assignedTo && task.assignedTo !== session.userId) {
    await logAudit({
      tenantId: session.tenantId, userId: session.userId,
      entityType: 'task', entityId: task.id, action: 'task.assigned',
      metadata: { leadId: lead.id, assignedTo: task.assignedTo },
    });
  }

  return NextResponse.json({ task });
});
