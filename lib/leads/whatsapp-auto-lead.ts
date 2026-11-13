import 'server-only';

import { prisma } from '@/lib/prisma';
import { ensureLeadFromConversation } from './ensure-from-conversation';
import { mainPipeline, whatsappLeadSource } from './whatsapp-auto-lead-rules';

/**
 * Creates the lead of a WhatsApp conversation that has none, in the first stage of the company's
 * main funnel. Moving between stages and the Meta/Google events stay with the team (no event is
 * sent here). Safe to call more than once: a conversation that already has a lead is left alone.
 */
export async function createWhatsAppConversationLead(input: {
  tenantId: string;
  conversationId: string;
  phone: string;
  displayName: string | null;
  fromAd: boolean;
}) {
  const pipelines = await prisma.pipeline.findMany({
    where: { tenantId: input.tenantId },
    select: { id: true, isDefault: true, isArchived: true, createdAt: true },
  });
  const pipeline = mainPipeline(pipelines);
  if (!pipeline) return { kind: 'no_pipeline' as const };
  const stage = await prisma.pipelineStage.findFirst({
    where: { pipelineId: pipeline.id, isArchived: false },
    orderBy: { orderIndex: 'asc' },
    select: { id: true },
  });
  if (!stage) return { kind: 'no_stage' as const };
  return ensureLeadFromConversation({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    pipelineId: pipeline.id,
    stageId: stage.id,
    source: whatsappLeadSource(input.fromAd),
    temperature: 'warm',
    requireValidPhone: true,
    identity: { displayName: input.displayName, phone: input.phone },
    audit: {
      userId: null,
      createdAction: 'lead.whatsapp_auto_created',
      linkedAction: 'lead.whatsapp_auto_linked',
      metadata: { reason: 'new_whatsapp_conversation' },
    },
  });
}
