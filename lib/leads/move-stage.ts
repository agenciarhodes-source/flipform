import 'server-only';

import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { dispatchKanbanStageTracking } from '@/lib/tracking';
import { enqueueGoogleConversionEvents } from '@/lib/tracking/google-funnel-outbox';
import { scheduleGoogleConversionDelivery } from '@/lib/tracking/google-funnel-processor';

/**
 * Moves a lead to a stage the same way a move on the Kanban does: status of the final and "Perdido"
 * stages, stage history, Meta stage events and the Google funnel. Used when a person approves a
 * suggestion of the Flip AI, or when the AI moves on its own (changedBy empty).
 */
export async function moveLeadToStage(input: {
  tenantId: string;
  leadId: string;
  stageId: string;
  changedBy: string | null;
  auditAction: string;
  auditMetadata?: Record<string, string | null>;
}) {
  const lead = await prisma.lead.findFirst({ where: { id: input.leadId, tenantId: input.tenantId } });
  if (!lead) return { moved: false as const, reason: 'lead_not_found' };
  const newStage = await prisma.pipelineStage.findFirst({
    where: { id: input.stageId, pipelineId: lead.pipelineId, isArchived: false, pipeline: { tenantId: input.tenantId } },
  });
  if (!newStage) return { moved: false as const, reason: 'stage_invalid' };
  if (lead.stageId === newStage.id) return { moved: false as const, reason: 'already_there' };

  const finalStage = await prisma.pipelineStage.findFirst({
    where: { pipelineId: newStage.pipelineId, isArchived: false, pipeline: { tenantId: input.tenantId } },
    orderBy: { orderIndex: 'desc' },
    select: { id: true },
  });
  let newStatus = lead.status;
  let newTemperature = lead.temperature;
  if (finalStage?.id === newStage.id) {
    newStatus = 'won';
    newTemperature = 'hot';
  } else if (newStage.name === 'Perdido') newStatus = 'lost';
  else newStatus = 'open';

  const [, stageHistory] = await prisma.$transaction([
    prisma.lead.update({ where: { id: lead.id }, data: { stageId: newStage.id, status: newStatus, temperature: newTemperature } }),
    prisma.leadStageHistory.create({
      data: { leadId: lead.id, fromStageId: lead.stageId, toStageId: newStage.id, changedBy: input.changedBy },
    }),
  ]);

  try {
    await dispatchKanbanStageTracking({
      tenantId: input.tenantId,
      leadId: lead.id,
      pipelineId: lead.pipelineId,
      fromStageId: lead.stageId,
      toStageId: newStage.id,
      triggeredById: input.changedBy,
      source: 'kanban',
      lead: { email: lead.email, phone: lead.phone, name: lead.name },
    });
  } catch {
    // Tracking records its own result and never undoes the move.
  }
  const google = await enqueueGoogleConversionEvents({
    tenantId: input.tenantId,
    leadId: lead.id,
    pipelineId: newStage.pipelineId,
    stageId: newStage.id,
    transitionId: stageHistory.id,
    occurredAt: stageHistory.createdAt,
    triggeredById: input.changedBy,
  });
  if (google.some((event) => event.status === 'queued')) scheduleGoogleConversionDelivery();

  await logAudit({
    tenantId: input.tenantId,
    userId: input.changedBy,
    entityType: 'lead',
    entityId: lead.id,
    action: input.auditAction,
    metadata: { fromStageId: lead.stageId, toStageId: newStage.id, newStatus, ...(input.auditMetadata || {}) },
  });
  return { moved: true as const, fromStageId: lead.stageId, toStageId: newStage.id };
}
