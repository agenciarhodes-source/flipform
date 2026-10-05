import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { loadLatestConversationAvailability } from './availability';
import {
  buildFlipAiHumanActionRequestDescription,
  flipAiHumanActionRequestKey,
  flipAiHumanActionRequestTaskId,
  FLIP_AI_HUMAN_ACTION_REQUEST_TITLE,
  FLIP_AI_HUMAN_ACTION_REQUEST_VERSION,
  humanActionRequestAuditMetadata,
  type FlipAiHumanActionRequestResolution,
} from './human-action-request-policy';

const ACTIONS = {
  created: 'flip_ai.action_request.created',
  confirmed: 'flip_ai.action_request.confirmed',
  declined: 'flip_ai.action_request.declined',
  reopened: 'flip_ai.action_request.reopened',
} as const;

export class FlipAiHumanActionRequestError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'FlipAiHumanActionRequestError';
  }
}

export type FlipAiHumanActionRequestSnapshot = {
  taskId: string;
  conversationId: string;
  status: 'pending' | 'completed' | 'overdue';
  resolution: FlipAiHumanActionRequestResolution;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high';
  assignedTo: string | null;
  assignee: { id: string; name: string; email: string } | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  version: string;
};

function resolutionFrom(input: {
  taskStatus: 'pending' | 'completed' | 'overdue';
  action?: string | null;
}): FlipAiHumanActionRequestResolution {
  if (input.taskStatus !== 'completed') return 'pending';
  if (input.action === ACTIONS.confirmed) return 'confirmed';
  if (input.action === ACTIONS.declined) return 'declined';
  return 'completed';
}

async function sourceAuditExists(input: {
  tenantId: string;
  taskId: string;
}) {
  return Boolean(await prisma.auditLog.findFirst({
    where: {
      tenantId: input.tenantId,
      entityType: 'task',
      entityId: input.taskId,
      action: ACTIONS.created,
    },
    select: { id: true },
  }));
}

export async function syncFlipAiHumanActionRequest(input: {
  tenantId: string;
  conversationId: string;
  agentId?: string | null;
}) {
  const availability = await loadLatestConversationAvailability({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
  }).catch(() => null);
  if (availability?.status !== 'ready_for_handoff') return null;

  const [conversation, tenant] = await Promise.all([
    prisma.conversation.findFirst({
      where: {
        tenantId: input.tenantId,
        id: input.conversationId,
        provider: 'flip_ai',
        channel: 'web',
      },
      select: {
        leadId: true,
        lead: { select: { id: true, assignedTo: true } },
      },
    }),
    prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { plan: { select: { canUseTasks: true } } },
    }),
  ]);

  const lead = conversation?.lead;
  if (!lead || conversation?.leadId !== lead.id) return null;
  if (tenant?.plan?.canUseTasks === false) return null;

  let assignedTo: string | null = null;
  if (lead.assignedTo) {
    const activeAssignee = await prisma.tenantUser.findFirst({
      where: {
        tenantId: input.tenantId,
        userId: lead.assignedTo,
        status: 'active',
      },
      select: { userId: true },
    });
    assignedTo = activeAssignee?.userId || null;
  }

  const taskId = flipAiHumanActionRequestTaskId({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
  });
  const requestKey = flipAiHumanActionRequestKey({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
  });
  const description = buildFlipAiHumanActionRequestDescription(availability);

  return prisma.$transaction(async (db) => {
    await db.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtext(${requestKey}))
    `);

    const existing = await db.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    if (existing) {
      const sourceAudit = await db.auditLog.findFirst({
        where: {
          tenantId: input.tenantId,
          entityType: 'task',
          entityId: existing.id,
          action: ACTIONS.created,
        },
        select: { id: true },
      });
      if (existing.tenantId !== input.tenantId || existing.leadId !== lead.id || !sourceAudit) {
        throw new FlipAiHumanActionRequestError(
          'FLIP_AI_ACTION_REQUEST_CONTEXT_CONFLICT',
          409,
          'A solicitação interna pertence a outro contexto.',
        );
      }
      return existing;
    }

    const task = await db.task.create({
      data: {
        id: taskId,
        tenantId: input.tenantId,
        leadId: lead.id,
        assignedTo,
        createdBy: null,
        title: FLIP_AI_HUMAN_ACTION_REQUEST_TITLE,
        description,
        dueDate: null,
        priority: 'high',
        status: 'pending',
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    await db.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: null,
        entityType: 'task',
        entityId: task.id,
        action: ACTIONS.created,
        metadata: humanActionRequestAuditMetadata({
          leadId: lead.id,
          conversationId: input.conversationId,
          agentId: input.agentId,
          availability,
          assignedTo,
        }),
      },
    });

    return task;
  });
}

export async function getFlipAiHumanActionRequest(input: {
  tenantId: string;
  leadId: string;
  conversationId: string | null;
}): Promise<FlipAiHumanActionRequestSnapshot | null> {
  if (!input.conversationId) return null;
  const taskId = flipAiHumanActionRequestTaskId({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
  });
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      tenantId: input.tenantId,
      leadId: input.leadId,
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
    },
  });
  if (!task) return null;
  if (!(await sourceAuditExists({ tenantId: input.tenantId, taskId: task.id }))) return null;

  const resolutionAudit = await prisma.auditLog.findFirst({
    where: {
      tenantId: input.tenantId,
      entityType: 'task',
      entityId: task.id,
      action: { in: [ACTIONS.confirmed, ACTIONS.declined, ACTIONS.reopened] },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { action: true },
  });

  return {
    taskId: task.id,
    conversationId: input.conversationId,
    status: task.status,
    resolution: resolutionFrom({
      taskStatus: task.status,
      action: resolutionAudit?.action,
    }),
    title: task.title,
    description: task.description,
    priority: task.priority,
    assignedTo: task.assignedTo,
    assignee: task.assignee,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
    version: FLIP_AI_HUMAN_ACTION_REQUEST_VERSION,
  };
}

export async function resolveFlipAiHumanActionRequest(input: {
  tenantId: string;
  leadId: string;
  taskId: string;
  userId: string;
  action: 'confirm' | 'decline' | 'reopen';
  note?: string | null;
}) {
  const task = await prisma.task.findFirst({
    where: {
      id: input.taskId,
      tenantId: input.tenantId,
      leadId: input.leadId,
    },
    include: {
      lead: { select: { id: true, assignedTo: true } },
    },
  });
  if (!task || !(await sourceAuditExists({ tenantId: input.tenantId, taskId: input.taskId }))) {
    throw new FlipAiHumanActionRequestError(
      'FLIP_AI_ACTION_REQUEST_NOT_FOUND',
      404,
      'Solicitação interna não encontrada.',
    );
  }

  const latestResolution = await prisma.auditLog.findFirst({
    where: {
      tenantId: input.tenantId,
      entityType: 'task',
      entityId: task.id,
      action: { in: [ACTIONS.confirmed, ACTIONS.declined, ACTIONS.reopened] },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { action: true },
  });

  const expectedAction = input.action === 'confirm'
    ? ACTIONS.confirmed
    : input.action === 'decline'
      ? ACTIONS.declined
      : ACTIONS.reopened;

  if (input.action !== 'reopen' && task.status === 'completed') {
    if (latestResolution?.action === expectedAction) return task;
    throw new FlipAiHumanActionRequestError(
      'FLIP_AI_ACTION_REQUEST_ALREADY_RESOLVED',
      409,
      'A solicitação já foi concluída. Reabra antes de alterar a decisão.',
    );
  }
  if (input.action === 'reopen' && task.status !== 'completed') return task;

  const updated = await prisma.$transaction(async (db) => {
    const result = await db.task.update({
      where: { id: task.id },
      data: input.action === 'reopen'
        ? { status: 'pending', completedAt: null }
        : { status: 'completed', completedAt: new Date() },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    await db.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        entityType: 'task',
        entityId: task.id,
        action: expectedAction,
        metadata: {
          source: 'flip_ai',
          requestType: 'in_person_confirmation',
          leadId: input.leadId,
          note: input.note?.trim().slice(0, 500) || null,
        },
      },
    });
    return result;
  });

  return updated;
}

export const FLIP_AI_HUMAN_ACTION_REQUEST_AUDIT_ACTIONS = ACTIONS;
