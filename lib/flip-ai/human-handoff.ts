import 'server-only';

import { prisma } from '@/lib/prisma';
import type { FlipAiLeadIntelligenceSnapshot } from './lead-intelligence-policy';
import {
  buildFlipAiHumanHandoffSnapshot,
  type FlipAiHumanHandoffSnapshot,
} from './human-handoff-policy';
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

  const conversationId = qualification?.conversationId
    || conversation?.id
    || input.intelligence?.conversationId
    || null;
  const availability = conversationId
    ? await loadLatestConversationAvailability({
      tenantId: input.tenantId,
      conversationId,
    }).catch(() => null)
    : null;

  const updatedAt = qualification?.createdAt
    || conversation?.flipAiState?.summaryUpdatedAt
    || conversation?.lastMessageAt
    || conversation?.updatedAt
    || new Date();

  return buildFlipAiHumanHandoffSnapshot({
    leadName: lead.name,
    hasPhone: Boolean(lead.phone),
    hasEmail: Boolean(lead.email),
    answers: lead.answers,
    qualification: qualification ? {
      summary: qualification.summary,
      reasons: qualification.reasons,
      nextAction: qualification.nextAction,
    } : null,
    stateSummary: conversation?.flipAiState?.summary || null,
    intelligence: input.intelligence,
    availability,
    conversationId,
    updatedAt,
  });
}
