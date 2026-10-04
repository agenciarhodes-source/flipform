import 'server-only';

import { prisma } from '@/lib/prisma';
import type { FlipAiLeadIntelligenceSnapshot } from './lead-intelligence-policy';

export type FlipAiHumanHandoffSnapshot = {
  summary: string;
  summarySource: 'qualification' | 'conversation_state' | 'deterministic';
  priority: 'high' | 'normal' | 'low';
  recommended: boolean;
  reason: string;
  nextAction: string;
  resumeGuidance: string;
  knownFacts: string[];
  reasons: string[];
  conversationId: string | null;
  updatedAt: string;
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  qualified: 'qualificado',
  nurture: 'em nutrição',
  disqualified: 'não qualificado',
  insufficient: 'ainda sem informação suficiente',
};

const INTENT_LABELS: Record<string, string> = {
  information: 'buscar informação',
  qualification: 'avançar na qualificação',
  objection: 'resolver uma objeção',
  scheduling: 'agendar',
  purchase: 'avançar na contratação ou compra',
  support: 'buscar suporte',
  handoff: 'falar com uma pessoa do time',
  other: 'continuar o atendimento',
};

const OBJECTION_LABELS: Record<string, string> = {
  none: 'nenhuma objeção relevante',
  price: 'preço',
  trust: 'confiança',
  timing: 'momento ou prazo',
  documentation: 'documentação',
  eligibility: 'elegibilidade ou perfil',
  competitor: 'concorrente ou alternativa',
  uncertainty: 'indecisão',
  other: 'outra objeção',
};

const NEXT_ACTION_LABELS: Record<string, string> = {
  answer_directly: 'Responder diretamente à dúvida atual.',
  ask_one_question: 'Fazer uma única pergunta curta para destravar o próximo passo.',
  handle_objection: 'Tratar a objeção atual antes de tentar avançar.',
  request_contact: 'Solicitar apenas o dado de contato que ainda falta.',
  schedule: 'Avançar para agenda ou visita.',
  handoff: 'Continuar com atendimento humano.',
};

function cleanText(value: string | null | undefined, max = 4_000) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : '';
}

function buildFallbackSummary(
  leadName: string,
  intelligence: FlipAiLeadIntelligenceSnapshot | null,
) {
  if (!intelligence) {
    return `${leadName || 'Lead'} possui uma conversa Flip AI vinculada, mas ainda não há inteligência suficiente para um resumo confiável.`;
  }
  const classification = CLASSIFICATION_LABELS[intelligence.classification] || intelligence.classification;
  const intent = INTENT_LABELS[intelligence.intent] || intelligence.intent;
  const objection = OBJECTION_LABELS[intelligence.objection] || intelligence.objection;
  return [
    `${leadName || 'Lead'} está ${classification}, com score ${intelligence.score}/100.`,
    `A intenção atual é ${intent}.`,
    intelligence.objection !== 'none' ? `A objeção principal identificada é ${objection}.` : '',
  ].filter(Boolean).join(' ');
}

function priorityOf(intelligence: FlipAiLeadIntelligenceSnapshot | null) {
  if (!intelligence) return 'low' as const;
  if (intelligence.needsHuman || intelligence.classification === 'qualified' || intelligence.score >= 80) {
    return 'high' as const;
  }
  if (intelligence.score >= 50 || intelligence.classification === 'nurture') {
    return 'normal' as const;
  }
  return 'low' as const;
}

function handoffReason(intelligence: FlipAiLeadIntelligenceSnapshot | null) {
  if (!intelligence) return 'Contexto disponível para continuidade manual.';
  if (intelligence.needsHuman) return 'O JEV sinalizou necessidade de atendimento humano.';
  if (intelligence.nextAction === 'handoff') return 'A próxima ação sugerida é atendimento humano.';
  if (intelligence.classification === 'qualified') return 'O perfil atual está classificado como qualificado.';
  if (intelligence.nextAction === 'schedule') return 'O lead está pronto para avançar para agenda ou visita.';
  return 'O resumo está disponível para continuidade sem reiniciar a conversa.';
}

function resumeGuidance(intelligence: FlipAiLeadIntelligenceSnapshot | null, nextAction: string) {
  const objection = intelligence?.objection && intelligence.objection !== 'none'
    ? OBJECTION_LABELS[intelligence.objection] || intelligence.objection
    : null;
  return [
    'Continue do ponto em que a conversa parou e evite repetir perguntas já respondidas.',
    objection ? `Considere primeiro a objeção de ${objection}.` : '',
    nextAction ? `Próximo passo sugerido: ${nextAction}` : '',
  ].filter(Boolean).join(' ');
}

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

  const qualificationSummary = cleanText(qualification?.summary);
  const stateSummary = cleanText(conversation?.flipAiState?.summary);
  const summarySource: FlipAiHumanHandoffSnapshot['summarySource'] = qualificationSummary
    ? 'qualification'
    : stateSummary
      ? 'conversation_state'
      : 'deterministic';
  const summary = qualificationSummary
    || stateSummary
    || buildFallbackSummary(lead.name, input.intelligence);

  const nextAction = cleanText(qualification?.nextAction, 1_000)
    || (input.intelligence
      ? NEXT_ACTION_LABELS[input.intelligence.nextAction] || input.intelligence.nextAction
      : 'Revisar a conversa antes de responder.');

  const knownFacts = [
    lead.name?.trim() ? `Nome: ${lead.name.trim()}` : '',
    lead.phone ? 'Telefone já capturado.' : '',
    lead.email ? 'E-mail já capturado.' : '',
    ...lead.answers.slice(0, 3).map((answer) => {
      const value = typeof answer.answer === 'string'
        ? answer.answer
        : JSON.stringify(answer.answer);
      const compact = cleanText(value, 220);
      return compact ? `${cleanText(answer.questionLabel, 120)}: ${compact}` : '';
    }),
  ].filter(Boolean).slice(0, 6);

  const reasons = qualification?.reasons?.length
    ? qualification.reasons.map((reason) => cleanText(reason, 500)).filter(Boolean).slice(0, 5)
    : input.intelligence
      ? [
        `Fit atual: ${input.intelligence.fitScore}/100.`,
        `Força da intenção: ${input.intelligence.intentScore}/100.`,
        `Urgência: ${input.intelligence.urgencyScore}/100.`,
        `Prontidão: ${input.intelligence.readinessScore}/100.`,
      ]
      : [];

  const updatedAt = qualification?.createdAt
    || conversation?.flipAiState?.summaryUpdatedAt
    || conversation?.lastMessageAt
    || conversation?.updatedAt
    || new Date();

  const recommended = Boolean(
    input.intelligence?.needsHuman
      || input.intelligence?.nextAction === 'handoff'
      || input.intelligence?.classification === 'qualified'
      || input.intelligence?.nextAction === 'schedule',
  );

  return {
    summary,
    summarySource,
    priority: priorityOf(input.intelligence),
    recommended,
    reason: handoffReason(input.intelligence),
    nextAction,
    resumeGuidance: resumeGuidance(input.intelligence, nextAction),
    knownFacts,
    reasons,
    conversationId: qualification?.conversationId || conversation?.id || input.intelligence?.conversationId || null,
    updatedAt: updatedAt.toISOString(),
  };
}
