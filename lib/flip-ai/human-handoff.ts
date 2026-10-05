import 'server-only';

import { prisma } from '@/lib/prisma';
import type { FlipAiLeadIntelligenceSnapshot } from './lead-intelligence-policy';
import {
  buildFlipAiHumanHandoffSnapshot,
  type FlipAiHumanHandoffSnapshot,
} from './human-handoff-policy';
import { loadLatestConversationMemory } from './conversation-memory';
import { loadLatestConversationAvailability } from './availability';

export async function getFlipAiHumanHandoff(input: {
  tenantId: string;
  leadId: string;
  intelligence: FlipAiLeadIntelligenceSnapshot | null;
}): Promise<FlipAiHumanHandoffSnapshot | null> {
  const lead = await prisma.lead.findFirst({
    where: { id: input.leadId, tenantId: input.tenantId },
    select: {
      name: true,
      phone: true,
      email: true,
      answers: {
        take: 5,
        orderBy: { createdAt: 'asc' },
        select: { questionLabel: true, answer: true },
      },
      flipAiQualifications: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: {
          conversationId: true,
          summary: true,
          reasons: true,
          nextAction: true,
          createdAt: true,
        },
      },
      conversations: {
        where: { provider: 'flip_ai' },
        take: 1,
        orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          lastMessageAt: true,
          updatedAt: true,
          flipAiState: {
            select: { summary: true, summaryUpdatedAt: true },
          },
        },
      },
    },
  });
  if (!lead) return null;

  const qualification = lead.flipAiQualifications[0] || null;
  const conversation = lead.conversations[0] || null;
  if (!qualification && !conversation && !input.intelligence) return null;

  const conversationId = input.intelligence?.conversationId
    || qualification?.conversationId
    || conversation?.id
    || null;
  const memory = conversationId ? await loadLatestConversationMemory({ tenantId: input.tenantId, conversationId }).catch(() => null) : null;
  const currentQualification = qualification?.conversationId === conversationId ? qualification : null;
  const availability = conversationId
    ? await loadLatestConversationAvailability({
      tenantId: input.tenantId,
      conversationId,
    }).catch(() => null)
    : null;

  const availabilityUpdatedAt = availability ? new Date(availability.updatedAt) : null;
  const timestamps = [
    memory ? new Date(memory.updatedAt) : null,
    availabilityUpdatedAt, currentQualification?.createdAt,
    conversation?.flipAiState?.summaryUpdatedAt, conversation?.lastMessageAt, conversation?.updatedAt,
  ].filter((date): date is Date => Boolean(date && Number.isFinite(date.getTime())));
  const updatedAt = timestamps.length ? new Date(Math.max(...timestamps.map((date) => date.getTime()))) : new Date();

  return buildFlipAiHumanHandoffSnapshot({
    leadName: lead.name,
    hasPhone: Boolean(lead.phone),
    hasEmail: Boolean(lead.email),
    answers: lead.answers,
    qualification: currentQualification ? {
      summary: currentQualification.summary,
      reasons: currentQualification.reasons,
      nextAction: currentQualification.nextAction,
    } : null,
    stateSummary: conversation?.id === conversationId ? conversation.flipAiState?.summary || null : null,
    intelligence: input.intelligence,
    memory,
    availability,
    conversationId,
    updatedAt,
  });
}
