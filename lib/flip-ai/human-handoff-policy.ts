import type { FlipAiConversationMemorySnapshot } from './conversation-memory-policy';
import type { FlipAiLeadIntelligenceSnapshot } from './lead-intelligence-policy';
import type { FlipAiAvailabilitySnapshot } from './availability-policy';

export type FlipAiHumanHandoffSnapshot = {
  summary: string;
  pending: string[];
  summarySource: 'qualification' | 'conversation_state' | 'deterministic' | 'conversation_memory';
  priority: 'high' | 'normal' | 'low';
  recommended: boolean;
  reason: string;
  nextAction: string;
  resumeGuidance: string;
  knownFacts: string[];
  reasons: string[];
  availability: FlipAiAvailabilitySnapshot | null;
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
  schedule: 'Coletar preferência de disponibilidade para atendimento presencial, sem confirmar compromisso.',
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
  const profile = intelligence.brainAssessment?.profileLabel;
  const classification = CLASSIFICATION_LABELS[intelligence.classification] || intelligence.classification;
  const intent = INTENT_LABELS[intelligence.intent] || intelligence.intent;
  const objection = OBJECTION_LABELS[intelligence.objection] || intelligence.objection;
  return [
    `${leadName || 'Lead'} está ${classification}${intelligence.brainAssessment && intelligence.brainAssessment.score === null ? '' : `, com score ${intelligence.score}/100`}.`,
    profile ? `Assunto identificado: ${profile}.` : '',
    `A intenção atual é ${intent}.`,
    intelligence.objection !== 'none' ? `A objeção principal identificada é ${objection}.` : '',
  ].filter(Boolean).join(' ');
}

function priorityOf(
  intelligence: FlipAiLeadIntelligenceSnapshot | null,
  availability: FlipAiAvailabilitySnapshot | null | undefined,
) {
  if (availability?.status === 'ready_for_handoff') return 'high' as const;
  if (!intelligence) return availability?.status === 'partial' ? 'normal' as const : 'low' as const;
  if (intelligence.needsHuman
    || intelligence.actionPermission.mayCollectAvailability
    || intelligence.classification === 'qualified'
    || intelligence.score >= 80) {
    return 'high' as const;
  }
  if (intelligence.score >= 50 || intelligence.classification === 'nurture') {
    return 'normal' as const;
  }
  return 'low' as const;
}

function handoffReason(
  intelligence: FlipAiLeadIntelligenceSnapshot | null,
  availability: FlipAiAvailabilitySnapshot | null | undefined,
) {
  if (availability?.status === 'ready_for_handoff') {
    return 'A pessoa já informou preferência suficiente de disponibilidade para confirmação humana.';
  }
  if (availability?.status === 'partial') {
    return 'A pessoa já informou parte da preferência de disponibilidade; ainda falta completar um dado.';
  }
  if (!intelligence) return 'Contexto disponível para continuidade manual.';
  if (intelligence.actionPermission.mayCollectAvailability) {
    return 'A pessoa quer atendimento presencial e marcação, e este agente permite coletar disponibilidade.';
  }
  if (intelligence.actionEligibility.inPersonRequested && !intelligence.actionPermission.supportedInPerson) {
    return 'A pessoa pediu uma modalidade presencial que não está habilitada para este agente.';
  }
  if (intelligence.actionPermission.mayDiscussInPerson) {
    return 'A pessoa demonstrou interesse presencial em uma modalidade habilitada para este agente.';
  }
  if (intelligence.needsHuman) return 'O JEV sinalizou necessidade de atendimento humano.';
  if (intelligence.nextAction === 'handoff') return 'A próxima ação sugerida é atendimento humano.';
  if (intelligence.classification === 'qualified') return 'O perfil atual está classificado como qualificado.';
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

export function buildFlipAiHumanHandoffSnapshot(input: {
  leadName: string;
  hasPhone: boolean;
  hasEmail: boolean;
  answers: Array<{ questionLabel: string; answer: unknown }>;
  qualification: {
    summary: string | null;
    reasons: string[];
    nextAction: string;
  } | null;
  stateSummary: string | null;
  intelligence: FlipAiLeadIntelligenceSnapshot | null;
  availability?: FlipAiAvailabilitySnapshot | null;
  conversationId: string | null;
  updatedAt: Date;
  memory?: FlipAiConversationMemorySnapshot | null;
}): FlipAiHumanHandoffSnapshot {
  const qualificationSummary = cleanText(input.qualification?.summary);
  const stateSummary = cleanText(input.stateSummary);
  const memoryFacts = (input.memory?.facts || []).map((item) => `${cleanText(item.key.replace(/_/g, ' '), 120)}: ${cleanText(item.value, 300)}`);
  const memorySummary = memoryFacts.length
    ? [input.intelligence?.brainAssessment?.profileLabel ? `Assunto identificado: ${input.intelligence.brainAssessment.profileLabel}.` : '', ...memoryFacts.slice(0, 5)].filter(Boolean).join(' ') : '';
  const summarySource: FlipAiHumanHandoffSnapshot['summarySource'] = memorySummary
    ? 'conversation_memory' : qualificationSummary
    ? 'qualification'
    : stateSummary
      ? 'conversation_state'
      : 'deterministic';
  const summary = memorySummary || qualificationSummary
    || stateSummary
    || buildFallbackSummary(input.leadName, input.intelligence);

  const nextAction = input.availability?.status === 'ready_for_handoff'
    ? 'Confirmar disponibilidade e combinar o atendimento presencial com a pessoa.'
    : input.intelligence
      ? NEXT_ACTION_LABELS[input.intelligence.nextAction] || input.intelligence.nextAction
      : cleanText(input.qualification?.nextAction, 1_000)
        || 'Revisar a conversa antes de responder.';

  const knownFacts = [
    input.leadName?.trim() ? `Nome: ${input.leadName.trim()}` : '',
    input.hasPhone ? 'Telefone já capturado.' : '',
    input.hasEmail ? 'E-mail já capturado.' : '',
    ...memoryFacts.slice(0, 6),
    ...input.answers.slice(0, 3).map((answer) => {
      const value = typeof answer.answer === 'string'
        ? answer.answer
        : JSON.stringify(answer.answer);
      const compact = cleanText(value, 220);
      return compact ? `${cleanText(answer.questionLabel, 120)}: ${compact}` : '';
    }),
    input.availability?.preferredDate
      ? `Dia/data preferida: ${input.availability.preferredDate}` : '',
    input.availability?.preferredPeriod
      ? `Período preferido: ${({
        morning: 'manhã', afternoon: 'tarde', evening: 'noite', flexible: 'flexível',
      } as const)[input.availability.preferredPeriod]}` : '',
    input.availability?.preferredTime
      ? `Horário preferido: ${input.availability.preferredTime}` : '',
  ].filter(Boolean).slice(0, 9);

  const reasons = input.intelligence?.brainAssessment
    ? input.intelligence.brainAssessment.criteria.map((item) => `${item.label}: ${item.interpretation || 'ainda não confirmado'}`).slice(0, 8)
    : input.qualification?.reasons?.length
    ? input.qualification.reasons.map((reason) => cleanText(reason, 500)).filter(Boolean).slice(0, 5)
    : input.intelligence
      ? [
        `Fit atual: ${input.intelligence.fitScore}/100.`,
        `Força da intenção: ${input.intelligence.intentScore}/100.`,
        `Urgência: ${input.intelligence.urgencyScore}/100.`,
        `Prontidão: ${input.intelligence.readinessScore}/100.`,
      ]
      : [];

  const recommended = Boolean(
    input.availability?.status === 'ready_for_handoff'
      || input.intelligence?.needsHuman
      || input.intelligence?.nextAction === 'handoff'
      || input.intelligence?.classification === 'qualified'
      || input.intelligence?.actionEligibility.inPersonRequested,
  );

  return {
    summary,
    pending: (input.memory?.pending || []).map((item) => `${cleanText(item.key.replace(/_/g, ' '), 120)}: ${cleanText(item.value, 300)}`).slice(0, 6),
    summarySource,
    priority: priorityOf(input.intelligence, input.availability),
    recommended,
    reason: handoffReason(input.intelligence, input.availability),
    nextAction,
    resumeGuidance: [
      resumeGuidance(input.intelligence, nextAction),
      input.availability?.status === 'partial'
        ? 'Há uma preferência de disponibilidade parcial; pergunte somente o que ainda faltar antes de confirmar com o time.'
        : '',
      input.availability?.status === 'ready_for_handoff'
        ? 'A preferência de disponibilidade já está suficiente; não repita perguntas de dia, período ou horário já respondidas.'
        : '',
    ].filter(Boolean).join(' '),
    knownFacts,
    reasons,
    availability: input.availability || null,
    conversationId: input.conversationId,
    updatedAt: input.updatedAt.toISOString(),
  };
}
