import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { streamOpenAiText, type OpenAiJsonSchemaFormat } from '@/lib/flip-ai/openai-responses';
import { getActiveFlipAiTextModel } from '@/lib/flip-ai/text-model-setting';
import { settleFlipAiUsageCharge } from '@/lib/flip-ai/usage-billing';
import { moveLeadToStage } from '@/lib/leads/move-stage';
import { historyContent, isTeamMessage } from '@/lib/flip-ai/history-content';
import { acceptedSuggestion, candidateStages, isOutcomeStageName, type StageCandidate } from './stage-rules';
import { conversationDocumentContext } from './documents';

const CLASSIFIER_FORMAT: OpenAiJsonSchemaFormat = {
  type: 'json_schema',
  name: 'flip_ai_stage_suggestion',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['move', 'stageId', 'reason'],
    properties: {
      move: { type: 'boolean' },
      stageId: { type: ['string', 'null'] },
      reason: { type: 'string' },
    },
  },
};

function classifierInstructions(candidates: StageCandidate[], currentStage: string) {
  return [
    'Você analisa uma conversa de WhatsApp entre uma empresa e um cliente para decidir em que etapa do funil o lead está agora.',
    'Leia a conversa inteira: o que o cliente contou, o resultado da triagem, o que foi pedido e o que ele respondeu ou enviou.',
    `Etapa atual do lead: "${currentStage}".`,
    'Etapas para onde ele pode ir e o que significa cada uma (critério escrito pela empresa, ou o sentido do nome da etapa):',
    ...candidates.map((candidate) => `- id ${candidate.id} · "${candidate.name}": ${candidate.criterion}`),
    'Responda move=true com o stageId da etapa que melhor descreve o momento ATUAL do lead, somente quando a conversa mostrar isso com clareza.',
    'Se a etapa atual ainda descreve bem o momento, ou se houver dúvida, responda move=false. Nunca mova por suposição.',
    'Se mais de uma servir, escolha a mais avançada que estiver claramente cumprida.',
    'Em reason, explique em uma frase curta, em português, o que na conversa justifica a mudança.',
  ].join('\n');
}

/**
 * After an AI reply on WhatsApp: compares the conversation with the criteria of the stages ahead
 * and either leaves a suggestion for the team or, in automatic mode, moves the lead.
 */
export async function suggestStageFromConversation(input: {
  tenantId: string;
  conversationId: string;
  agentId: string;
  mode: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId },
    select: { leadId: true },
  });
  if (!conversation?.leadId) return { kind: 'no_lead' as const };

  const lead = await prisma.lead.findFirst({
    where: { id: conversation.leadId, tenantId: input.tenantId },
    select: {
      id: true, status: true, stageId: true,
      stage: { select: { name: true, orderIndex: true } },
      pipeline: {
        select: {
          stages: {
            select: { id: true, name: true, orderIndex: true, isArchived: true, aiRule: { select: { criterion: true, enabled: true } } },
          },
        },
      },
      history: { where: { changedBy: { not: null } }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
  });
  if (!lead) return { kind: 'no_lead' as const };

  const candidates = candidateStages({
    lead: { status: lead.status, stageOrderIndex: lead.stage.orderIndex },
    stages: lead.pipeline.stages.map((stage) => ({ ...stage, rule: stage.aiRule })),
    lastManualMoveAt: lead.history[0]?.createdAt || null,
    now,
  });
  if (!candidates.length) return { kind: 'no_candidates' as const };

  const history = await prisma.message.findMany({
    where: { tenantId: input.tenantId, conversationId: input.conversationId },
    orderBy: [{ providerTimestamp: 'desc' }, { createdAt: 'desc' }],
    take: 24,
    select: { direction: true, type: true, text: true, metadata: true, sentByUserId: true },
  });
  // Voice notes count through their transcript, and the team is told apart from the AI.
  const teamInvolved = history.some((message) => isTeamMessage(message));
  const transcript = history.reverse().map((message) => {
    const team = isTeamMessage(message);
    const who = message.direction === 'inbound' ? 'Cliente' : team ? 'Equipe' : 'Escritório';
    const content = historyContent(message)?.replace(/^\[Equipe\] /, '');
    const body = content || (message.type !== 'text' ? `[${message.type} enviado]` : '');
    return body ? `${who}: ${body.slice(0, 600)}` : '';
  }).filter(Boolean).join('\n');
  if (!transcript) return { kind: 'no_messages' as const };
  const documents = await conversationDocumentContext(input.tenantId, input.conversationId).catch(() => null);
  const conversationText = documents?.checklist ? `${transcript}\n\n${documents.text}` : transcript;

  const model = (await getActiveFlipAiTextModel()).model;
  const result = await streamOpenAiText(
    { instructions: classifierInstructions(candidates, lead.stage.name), messages: [{ role: 'user', content: conversationText }] },
    () => undefined,
    { model, textFormat: CLASSIFIER_FORMAT, timeoutMs: 20_000, maxOutputTokens: 300, safetyIdentifier: input.conversationId },
  );
  await chargeClassification({ ...input, leadId: lead.id, result });

  let answer: { move: boolean; stageId: string | null; reason: string } | null = null;
  try {
    answer = JSON.parse(result.text);
  } catch {
    answer = null;
  }
  const accepted = acceptedSuggestion(answer, candidates);
  if (!accepted) return { kind: 'no_change' as const };

  // One open suggestion per lead: a newer one replaces the previous.
  await prisma.leadStageSuggestion.updateMany({
    where: { tenantId: input.tenantId, leadId: lead.id, status: 'pending' },
    data: { status: 'expired', decidedAt: now },
  });

  // A case the team is handling is never closed by the AI alone ("Não qualificado", "Já é cliente"):
  // the move waits as a suggestion for a person to approve.
  const autoMove = input.mode === 'auto' && !(teamInvolved && isOutcomeStageName(accepted.stage.name));
  if (autoMove) {
    const moved = await moveLeadToStage({
      tenantId: input.tenantId,
      leadId: lead.id,
      stageId: accepted.stage.id,
      changedBy: null,
      auditAction: 'lead.moved_by_flip_ai',
      auditMetadata: { reason: accepted.reason, conversationId: input.conversationId },
    });
    if (moved.moved) {
      await prisma.leadStageSuggestion.create({
        data: {
          tenantId: input.tenantId, leadId: lead.id, conversationId: input.conversationId,
          fromStageId: lead.stageId, toStageId: accepted.stage.id, reason: accepted.reason,
          status: 'auto_applied', decidedAt: now,
        },
      });
      return { kind: 'moved' as const, stageId: accepted.stage.id };
    }
    return { kind: 'no_change' as const };
  }

  await prisma.leadStageSuggestion.create({
    data: {
      tenantId: input.tenantId, leadId: lead.id, conversationId: input.conversationId,
      fromStageId: lead.stageId, toStageId: accepted.stage.id, reason: accepted.reason, status: 'pending',
    },
  });
  return { kind: 'suggested' as const, stageId: accepted.stage.id };
}

async function chargeClassification(input: {
  tenantId: string;
  agentId: string;
  conversationId: string;
  leadId: string;
  result: { model: string; inputTokens: number; outputTokens: number; responseId: string };
}) {
  try {
    const event = await prisma.flipAiUsageEvent.create({
      data: {
        tenantId: input.tenantId,
        agentId: input.agentId,
        conversationId: input.conversationId,
        requestKey: `stage-suggestion:${input.result.responseId}`,
        operation: 'stage_suggestion',
        provider: 'openai',
        model: input.result.model,
        status: 'confirmed',
        inputTokens: input.result.inputTokens,
        outputTokens: input.result.outputTokens,
        units: 1,
        metadata: { channel: 'whatsapp', leadId: input.leadId } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await settleFlipAiUsageCharge({ tenantId: input.tenantId, eventId: event.id });
  } catch {
    // Charging never blocks the suggestion; a repeated response is not charged twice.
  }
}

/** A person approves or turns down a pending suggestion. Approving moves the lead like the Kanban. */
export async function decideStageSuggestion(input: {
  tenantId: string;
  suggestionId: string;
  userId: string;
  action: 'approve' | 'reject';
}) {
  const suggestion = await prisma.leadStageSuggestion.findFirst({
    where: { id: input.suggestionId, tenantId: input.tenantId, status: 'pending' },
  });
  if (!suggestion) return { ok: false as const, reason: 'not_found' };
  const now = new Date();
  if (input.action === 'reject') {
    await prisma.leadStageSuggestion.update({
      where: { id: suggestion.id },
      data: { status: 'rejected', decidedBy: input.userId, decidedAt: now },
    });
    return { ok: true as const };
  }
  const moved = await moveLeadToStage({
    tenantId: input.tenantId,
    leadId: suggestion.leadId,
    stageId: suggestion.toStageId,
    changedBy: input.userId,
    auditAction: 'lead.moved',
    auditMetadata: { approvedFlipAiSuggestion: suggestion.id },
  });
  await prisma.leadStageSuggestion.update({
    where: { id: suggestion.id },
    data: { status: moved.moved ? 'approved' : 'expired', decidedBy: input.userId, decidedAt: now },
  });
  return moved.moved ? { ok: true as const } : { ok: false as const, reason: moved.reason };
}
