import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { can } from '@/lib/rbac';
import { dispatchKanbanStageTracking } from '@/lib/tracking';
import { LEAD_MOVE_STAGE_ACTION } from '../adapters/crm';
import type { AutomationActionHandler } from '../types';

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function findAuthorizedLeadMover(input: {
  tenantId: string;
  preferredUserId: string | null;
}) {
  if (input.preferredUserId) {
    const preferred = await prisma.tenantUser.findFirst({
      where: { tenantId: input.tenantId, userId: input.preferredUserId, status: 'active' },
      select: { userId: true, role: true },
    });
    if (preferred && can(preferred.role, 'INTEGRATIONS_EDIT') && can(preferred.role, 'KANBAN_MOVE_ALL')) {
      return preferred;
    }
  }

  const memberships = await prisma.tenantUser.findMany({
    where: { tenantId: input.tenantId, status: 'active' },
    orderBy: { createdAt: 'asc' },
    select: { userId: true, role: true },
  });
  return memberships.find(membership => (
    can(membership.role, 'INTEGRATIONS_EDIT')
    && can(membership.role, 'KANBAN_MOVE_ALL')
  )) || null;
}

type LockedConversation = {
  id: string;
  lead_id: string | null;
};

type LockedLead = {
  id: string;
  pipeline_id: string;
  stage_id: string;
  status: string;
  temperature: string;
  email: string | null;
  phone: string | null;
  name: string;
};

export function createLeadMoveStageAutomationHandler(): AutomationActionHandler {
  return async context => {
    if (context.action.type !== LEAD_MOVE_STAGE_ACTION) {
      return { status: 'failed', code: 'INVALID_LEAD_MOVE_STAGE_ACTION' };
    }

    const conversationId = stringField(context.input.conversationId);
    const pipelineId = stringField(context.action.config.pipelineId);
    const stageId = stringField(context.action.config.stageId);
    if (!conversationId || !pipelineId || !stageId) {
      return { status: 'failed', code: 'INVALID_LEAD_MOVE_STAGE_CONFIG' };
    }

    const actor = await findAuthorizedLeadMover({
      tenantId: context.tenantId,
      preferredUserId: context.configuredByUserId,
    });
    if (!actor) return { status: 'skipped', code: 'NO_AUTHORIZED_KANBAN_AUTOMATION_ACTOR' };

    try {
      const move = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const conversationRows = await tx.$queryRaw<LockedConversation[]>`
          SELECT id, lead_id
          FROM public.conversations
          WHERE id = ${conversationId}
            AND tenant_id = ${context.tenantId}
          FOR UPDATE
        `;
        const conversation = conversationRows[0];
        if (!conversation) return { kind: 'conversation_missing' as const };
        if (!conversation.lead_id) return { kind: 'lead_missing' as const };

        const leadRows = await tx.$queryRaw<LockedLead[]>`
          SELECT id, pipeline_id, stage_id, status, temperature, email, phone, name
          FROM public.leads
          WHERE id = ${conversation.lead_id}
            AND tenant_id = ${context.tenantId}
          FOR UPDATE
        `;
        const lead = leadRows[0];
        if (!lead) return { kind: 'lead_missing' as const };
        if (lead.pipeline_id !== pipelineId) return { kind: 'pipeline_mismatch' as const };

        const stage = await tx.pipelineStage.findFirst({
          where: {
            id: stageId,
            pipelineId,
            isArchived: false,
            pipeline: { tenantId: context.tenantId, isArchived: false },
          },
          select: { id: true, name: true },
        });
        if (!stage) return { kind: 'stage_invalid' as const };

        const marker = await tx.auditLog.findFirst({
          where: {
            tenantId: context.tenantId,
            entityType: 'automation_execution_action',
            entityId: context.idempotencyKey,
            action: 'LEAD_STAGE_MOVED',
          },
          select: { id: true },
        });

        if (lead.stage_id === stageId) {
          return {
            kind: 'already_in_stage' as const,
            trackingNeeded: Boolean(marker),
            lead: {
              id: lead.id,
              pipelineId: lead.pipeline_id,
              fromStageId: null as string | null,
              toStageId: stageId,
              email: lead.email,
              phone: lead.phone,
              name: lead.name,
            },
          };
        }

        const finalStage = await tx.pipelineStage.findFirst({
          where: {
            pipelineId,
            isArchived: false,
            pipeline: { tenantId: context.tenantId, isArchived: false },
          },
          orderBy: { orderIndex: 'desc' },
          select: { id: true },
        });
        const isFinalStage = finalStage?.id === stageId;
        const newStatus = isFinalStage ? 'won' : stage.name === 'Perdido' ? 'lost' : 'open';
        const newTemperature = isFinalStage ? 'hot' : lead.temperature;

        await tx.lead.update({
          where: { id: lead.id },
          data: {
            stageId,
            status: newStatus as any,
            temperature: newTemperature as any,
          },
        });
        await tx.leadStageHistory.create({
          data: {
            leadId: lead.id,
            fromStageId: lead.stage_id,
            toStageId: stageId,
            changedBy: actor.userId,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: context.tenantId,
            userId: actor.userId,
            entityType: 'automation_execution_action',
            entityId: context.idempotencyKey,
            action: 'LEAD_STAGE_MOVED',
            metadata: {
              executionId: context.executionId,
              definitionId: context.definitionId,
              leadId: lead.id,
              conversationId,
              fromStageId: lead.stage_id,
              toStageId: stageId,
            },
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: context.tenantId,
            userId: actor.userId,
            entityType: 'lead',
            entityId: lead.id,
            action: 'lead.automation_moved',
            metadata: {
              executionId: context.executionId,
              definitionId: context.definitionId,
              conversationId,
              fromStageId: lead.stage_id,
              toStageId: stageId,
              newStatus,
              newTemperature,
            },
          },
        });

        return {
          kind: 'moved' as const,
          trackingNeeded: true,
          lead: {
            id: lead.id,
            pipelineId: lead.pipeline_id,
            fromStageId: lead.stage_id,
            toStageId: stageId,
            email: lead.email,
            phone: lead.phone,
            name: lead.name,
          },
        };
      });

      if (move.kind === 'conversation_missing') return { status: 'failed', code: 'AUTOMATION_CONVERSATION_NOT_FOUND' };
      if (move.kind === 'lead_missing') return { status: 'skipped', code: 'AUTOMATION_LINKED_LEAD_NOT_FOUND' };
      if (move.kind === 'pipeline_mismatch') return { status: 'failed', code: 'AUTOMATION_LEAD_PIPELINE_MISMATCH' };
      if (move.kind === 'stage_invalid') return { status: 'failed', code: 'AUTOMATION_STAGE_INVALID' };
      if (!move.trackingNeeded) return { status: 'completed' };

      const tracking = await dispatchKanbanStageTracking({
        tenantId: context.tenantId,
        leadId: move.lead.id,
        pipelineId: move.lead.pipelineId,
        fromStageId: move.lead.fromStageId,
        toStageId: move.lead.toStageId,
        triggeredById: actor.userId,
        source: 'kanban',
        lead: {
          email: move.lead.email,
          phone: move.lead.phone,
          name: move.lead.name,
        },
      });
      if (tracking.some(result => result.status === 'failed')) {
        return { status: 'retry', code: 'KANBAN_TRACKING_RETRY' };
      }
      return { status: 'completed' };
    } catch {
      return { status: 'retry', code: 'LEAD_MOVE_STAGE_INTERNAL_ERROR' };
    }
  };
}
