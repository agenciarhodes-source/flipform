import {
  EMPTY_FLIP_AI_ACTION_CAPABILITIES,
  FLIP_AI_ACTION_CAPABILITIES_VERSION,
  type FlipAiActionCapabilities,
} from './action-capabilities';

export const FLIP_AI_ACTION_ELIGIBILITY_VERSION = '2026-10-05.1';

export type FlipAiActionSignals = {
  humanHandoffInterest: number;
  inPersonInterest: number;
  visitInterest: number;
  productDemoInterest: number;
  schedulingInterest: number;
};

export type FlipAiActionNext =
  | 'answer_directly'
  | 'ask_one_question'
  | 'handle_objection'
  | 'request_contact'
  | 'schedule'
  | 'handoff';

export type FlipAiSchedulingStatus =
  | 'blocked'
  | 'in_person_interest'
  | 'clarify_in_person'
  | 'collect_availability';

export type FlipAiActionPermissionStatus =
  | 'blocked'
  | 'unsupported'
  | 'discuss_in_person'
  | 'clarify_in_person'
  | 'collect_availability';

export type FlipAiActionEligibility = {
  version: string;
  humanHandoffRequested: boolean;
  inPersonRequested: boolean;
  visitRequested: boolean;
  productDemoRequested: boolean;
  schedulingRequested: boolean;
  mayDiscussScheduling: boolean;
  mayCollectAvailability: boolean;
  schedulingStatus: FlipAiSchedulingStatus;
  effectiveNextAction: FlipAiActionNext;
  reason: string;
};

export type FlipAiActionPermission = {
  version: string;
  capabilitiesVersion: string;
  capabilities: FlipAiActionCapabilities;
  status: FlipAiActionPermissionStatus;
  supportedInPerson: boolean;
  mayDiscussInPerson: boolean;
  mayCollectAvailability: boolean;
  effectiveNextAction: FlipAiActionNext;
  reason: string;
};


const EXPLICIT_THRESHOLD = 0.72;

function boundProbability(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function normalizeActionSignals(
  value: Partial<FlipAiActionSignals> | null | undefined,
): FlipAiActionSignals {
  return {
    humanHandoffInterest: boundProbability(value?.humanHandoffInterest),
    inPersonInterest: boundProbability(value?.inPersonInterest),
    visitInterest: boundProbability(value?.visitInterest),
    productDemoInterest: boundProbability(value?.productDemoInterest),
    schedulingInterest: boundProbability(value?.schedulingInterest),
  };
}

export function resolveFlipAiActionEligibility(input: {
  rawNextAction: FlipAiActionNext;
  signals?: Partial<FlipAiActionSignals> | null;
  needsHuman?: boolean;
}): FlipAiActionEligibility {
  const signals = normalizeActionSignals(input.signals);

  const humanHandoffRequested = signals.humanHandoffInterest >= EXPLICIT_THRESHOLD;
  const visitRequested = signals.visitInterest >= EXPLICIT_THRESHOLD;
  const productDemoRequested = signals.productDemoInterest >= EXPLICIT_THRESHOLD;
  const directInPersonRequested = signals.inPersonInterest >= EXPLICIT_THRESHOLD;
  const inPersonRequested = directInPersonRequested || visitRequested || productDemoRequested;
  const schedulingRequested = signals.schedulingInterest >= EXPLICIT_THRESHOLD;

  let schedulingStatus: FlipAiSchedulingStatus = 'blocked';
  let reason = 'Nenhum interesse presencial suficientemente claro foi identificado.';

  if (schedulingRequested && inPersonRequested) {
    schedulingStatus = 'collect_availability';
    reason = 'A pessoa demonstrou interesse presencial e também pediu ou aceitou discutir agendamento.';
  } else if (inPersonRequested) {
    schedulingStatus = 'in_person_interest';
    reason = 'Há interesse presencial, visita ou demonstração, mas ainda não há pedido claro para marcar horário.';
  } else if (schedulingRequested) {
    schedulingStatus = 'clarify_in_person';
    reason = 'Há interesse em marcar algo, mas ainda não está claro se a pessoa quer atendimento presencial.';
  } else if (humanHandoffRequested || input.needsHuman) {
    reason = 'Há interesse ou necessidade de atendimento humano, sem evidência de que isso seja presencial.';
  }

  const mayDiscussScheduling = schedulingStatus === 'in_person_interest'
    || schedulingStatus === 'collect_availability';
  const mayCollectAvailability = schedulingStatus === 'collect_availability';

  let effectiveNextAction = input.rawNextAction;
  if (input.rawNextAction === 'schedule' && !mayCollectAvailability) {
    if (schedulingStatus === 'clarify_in_person' || schedulingStatus === 'in_person_interest') {
      effectiveNextAction = 'ask_one_question';
    } else if (humanHandoffRequested || input.needsHuman) {
      effectiveNextAction = 'handoff';
    } else {
      effectiveNextAction = 'answer_directly';
    }
  }

  return {
    version: FLIP_AI_ACTION_ELIGIBILITY_VERSION,
    humanHandoffRequested,
    inPersonRequested,
    visitRequested,
    productDemoRequested,
    schedulingRequested,
    mayDiscussScheduling,
    mayCollectAvailability,
    schedulingStatus,
    effectiveNextAction,
    reason,
  };
}

export function resolveFlipAiActionPermission(input: {
  eligibility: FlipAiActionEligibility;
  capabilities?: FlipAiActionCapabilities | null;
}): FlipAiActionPermission {
  const capabilities = input.capabilities || EMPTY_FLIP_AI_ACTION_CAPABILITIES;
  const { eligibility } = input;
  const hasAnyInPersonCapability = capabilities.inPersonService
    || capabilities.customerVisit
    || capabilities.productDemo;

  const requestedModeSupport: boolean[] = [];
  if (eligibility.visitRequested) requestedModeSupport.push(capabilities.customerVisit);
  if (eligibility.productDemoRequested) requestedModeSupport.push(capabilities.productDemo);
  if (eligibility.inPersonRequested
    && !eligibility.visitRequested
    && !eligibility.productDemoRequested) {
    requestedModeSupport.push(capabilities.inPersonService);
  }
  const supportedInPerson = requestedModeSupport.length > 0
    && requestedModeSupport.every(Boolean);

  let status: FlipAiActionPermissionStatus = 'blocked';
  let reason = 'Nenhuma ação presencial está habilitada para este ponto da conversa.';

  if (eligibility.schedulingStatus === 'clarify_in_person' && hasAnyInPersonCapability) {
    status = 'clarify_in_person';
    reason = 'A pessoa quer marcar algo, e este agente possui capacidade presencial; a modalidade ainda precisa ser esclarecida.';
  } else if (eligibility.inPersonRequested && !supportedInPerson) {
    status = 'unsupported';
    reason = 'A pessoa demonstrou interesse presencial, mas o agente não está configurado para oferecer a modalidade solicitada.';
  } else if (eligibility.schedulingStatus === 'collect_availability'
    && supportedInPerson
    && capabilities.inPersonScheduling) {
    status = 'collect_availability';
    reason = 'A pessoa quer atendimento presencial e marcação, e o agente permite coletar preferência de disponibilidade.';
  } else if (eligibility.inPersonRequested && supportedInPerson) {
    status = 'discuss_in_person';
    reason = eligibility.schedulingRequested
      ? 'A modalidade presencial é suportada, mas a coleta de disponibilidade está desativada para este agente.'
      : 'A modalidade presencial solicitada é suportada por este agente.';
  }

  const mayDiscussInPerson = status === 'discuss_in_person' || status === 'collect_availability';
  const mayCollectAvailability = status === 'collect_availability';

  let effectiveNextAction = eligibility.effectiveNextAction;
  if (status === 'blocked'
    && eligibility.schedulingStatus === 'clarify_in_person'
    && !hasAnyInPersonCapability) {
    effectiveNextAction = eligibility.humanHandoffRequested ? 'handoff' : 'answer_directly';
  } else if (eligibility.effectiveNextAction === 'schedule' && !mayCollectAvailability) {
    if (status === 'clarify_in_person') {
      effectiveNextAction = 'ask_one_question';
    } else if (status === 'discuss_in_person'
      && eligibility.schedulingRequested
      && !capabilities.inPersonScheduling) {
      effectiveNextAction = 'handoff';
    } else if (status === 'discuss_in_person') {
      effectiveNextAction = 'ask_one_question';
    } else if (eligibility.humanHandoffRequested) {
      effectiveNextAction = 'handoff';
    } else {
      effectiveNextAction = 'answer_directly';
    }
  }

  return {
    version: FLIP_AI_ACTION_ELIGIBILITY_VERSION,
    capabilitiesVersion: FLIP_AI_ACTION_CAPABILITIES_VERSION,
    capabilities,
    status,
    supportedInPerson,
    mayDiscussInPerson,
    mayCollectAvailability,
    effectiveNextAction,
    reason,
  };
}

export function actionPermissionPrompt(permission: FlipAiActionPermission) {
  if (permission.status === 'collect_availability') {
    return [
      'A modalidade presencial solicitada é permitida por este agente.',
      'Você pode coletar preferência de dia OU horário, uma pergunta por vez.',
      'Não confirme compromisso nem prometa disponibilidade.',
    ].join(' ');
  }
  if (permission.status === 'discuss_in_person') {
    return [
      'A modalidade presencial solicitada é permitida por este agente.',
      'Você pode reconhecer essa possibilidade.',
      permission.capabilities.inPersonScheduling
        ? 'Se a pessoa quiser marcar, confirme primeiro essa intenção antes de pedir disponibilidade.'
        : 'A coleta de dia/horário está desativada para este agente; não peça disponibilidade. Se a pessoa quiser marcar, encaminhe para atendimento humano.',
    ].join(' ');
  }
  if (permission.status === 'unsupported') {
    return [
      'A pessoa demonstrou interesse presencial, mas a modalidade solicitada não está habilitada para este agente.',
      'Não ofereça, não prometa e não invente essa opção.',
      'Continue o atendimento normal ou faça handoff humano quando necessário.',
    ].join(' ');
  }
  if (permission.status === 'clarify_in_person') {
    return [
      'A pessoa quer marcar algo, mas ainda não está claro se é presencial.',
      'Faça uma única pergunta curta para esclarecer a modalidade.',
      'Não peça data ou horário ainda.',
    ].join(' ');
  }
  return [
    'Nenhuma ação presencial está habilitada neste ponto da conversa.',
    'Não ofereça visita, demonstração, atendimento presencial ou horário por iniciativa própria.',
  ].join(' ');
}

export function actionEligibilityPrompt(eligibility: FlipAiActionEligibility) {
  if (eligibility.schedulingStatus === 'collect_availability') {
    return [
      'A pessoa demonstrou interesse presencial e quer discutir marcação.',
      'Você pode coletar uma preferência de dia OU horário, uma pergunta por vez.',
      'Não confirme horário, não prometa disponibilidade e não diga que algo foi agendado.',
    ].join(' ');
  }
  if (eligibility.schedulingStatus === 'in_person_interest') {
    return [
      'Há interesse em atendimento presencial, visita ou demonstração.',
      'Você pode reconhecer esse interesse e, somente se fizer sentido, perguntar se a pessoa deseja combinar um horário.',
      'Não peça dia/horário antes de ela demonstrar que quer agendar.',
    ].join(' ');
  }
  if (eligibility.schedulingStatus === 'clarify_in_person') {
    return [
      'A pessoa falou em marcar algo, mas não está claro se é presencial.',
      'Faça uma única pergunta curta para esclarecer a modalidade antes de tratar de agenda.',
      'Não peça data ou horário ainda.',
    ].join(' ');
  }
  return [
    'Agenda presencial está bloqueada para este ponto da conversa.',
    'Não ofereça visita, demonstração ou horário por iniciativa própria.',
    'Um pedido para falar com uma pessoa não significa pedido de atendimento presencial.',
  ].join(' ');
}
