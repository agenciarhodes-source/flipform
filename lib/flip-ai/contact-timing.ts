import type { FlipAiConversationDecision } from './decision-engine';

/**
 * When to ask for name and phone. Deterministic: it reads how many times the agent
 * already asked, how long ago, and the JEV reading of the conversation moment.
 * It only shapes the guidance given to the model; it never creates or changes a Lead.
 */

export const FLIP_AI_CONTACT_MAX_REQUESTS = 3;
/** Replies the agent must give after an unanswered request before asking again. */
export const FLIP_AI_CONTACT_COOLDOWN_REPLIES = 2;
/** Without a clear buying signal, the agent still asks once the visitor sent this many messages. */
export const FLIP_AI_CONTACT_FALLBACK_INBOUND_MESSAGES = 5;

export type FlipAiContactMoment =
  | 'discover_first'
  | 'ask_now'
  | 'handle_objection_first'
  | 'hold_after_request'
  | 'stop_requesting'
  | 'out_of_profile';

const CONTACT_REQUEST_PATTERN = new RegExp([
  'como (voc[eê]|vc) se chama',
  'qual (e |é )?(o )?seu nome',
  'seu nome e (seu )?(telefone|whatsapp|n[uú]mero)',
  'nome e (o )?(telefone|whatsapp|n[uú]mero)',
  '(qual|me (passa|informa|diz)|pode (me )?(passar|informar)).{0,40}(telefone|whatsapp|n[uú]mero|contato)',
  'seu (telefone|whatsapp|n[uú]mero)',
].join('|'), 'i');

export function isContactRequest(text: string) {
  return text.includes('?') && CONTACT_REQUEST_PATTERN.test(text);
}

export function summarizeContactRequests(assistantMessages: string[]) {
  let requests = 0;
  let repliesSinceLastRequest: number | null = null;
  for (const message of assistantMessages) {
    if (isContactRequest(message)) {
      requests += 1;
      repliesSinceLastRequest = 0;
    } else if (repliesSinceLastRequest !== null) {
      repliesSinceLastRequest += 1;
    }
  }
  return { requests, repliesSinceLastRequest };
}

function isBuyingMoment(decision: FlipAiConversationDecision) {
  return decision.journeyStage === 'consideration'
    || decision.journeyStage === 'decision'
    || decision.intent === 'scheduling'
    || decision.intent === 'purchase'
    || decision.intent === 'handoff'
    || decision.nextAction === 'request_contact'
    || (decision.intentScore ?? 0) >= 70
    || (decision.readinessScore ?? 0) >= 70;
}

export function resolveContactMoment(input: {
  inboundMessages: number;
  assistantMessages?: string[];
  decision?: FlipAiConversationDecision | null;
}): FlipAiContactMoment {
  const { requests, repliesSinceLastRequest } = summarizeContactRequests(input.assistantMessages || []);
  const decision = input.decision || null;

  if (decision && decision.fitScore <= 25 && decision.confidence >= 0.65) return 'out_of_profile';
  if (requests >= FLIP_AI_CONTACT_MAX_REQUESTS) return 'stop_requesting';
  if (repliesSinceLastRequest !== null && repliesSinceLastRequest < FLIP_AI_CONTACT_COOLDOWN_REPLIES) {
    return 'hold_after_request';
  }

  if (!decision) {
    // No reading of the moment: keep the simple rule based on how much the person already said.
    return input.inboundMessages >= 3 ? 'ask_now' : 'discover_first';
  }
  if (decision.objection !== 'none' && decision.objectionConfidence >= 0.5) return 'handle_objection_first';
  if (input.inboundMessages >= 2 && isBuyingMoment(decision)) return 'ask_now';
  if (input.inboundMessages >= FLIP_AI_CONTACT_FALLBACK_INBOUND_MESSAGES) return 'ask_now';
  return 'discover_first';
}

export const FLIP_AI_CONTACT_GUIDANCE: Record<FlipAiContactMoment, string> = {
  discover_first: 'Faça descoberta mínima: responda ao que a pessoa perguntou e busque somente o próximo dado que realmente muda a qualificação. Assim que a necessidade e um sinal básico de perfil estiverem claros, avance para a identificação.',
  ask_now: 'CAPTURA PRIORITÁRIA: este é um bom momento para identificar a pessoa. Se a necessidade e um sinal básico de perfil já estiverem claros, peça agora o dado de contato que falta, sem abrir outra sequência de diagnóstico. Se houver uma dúvida direta, responda-a brevemente e, na mesma resposta, peça o dado de contato que falta, dizendo para que ele serve. Só adie isso por segurança ou quando ainda não for possível entender minimamente o que a pessoa procura.',
  handle_objection_first: 'MOMENTO DA CONVERSA: a pessoa trouxe uma objeção. Não peça nome nem telefone nesta resposta. Reconheça o ponto, responda ao motivo real da resistência e só volte ao contato depois que a objeção estiver tratada.',
  hold_after_request: 'MOMENTO DA CONVERSA: você pediu o contato há pouco e a pessoa não informou. Não repita o pedido nesta resposta. Responda de verdade ao que ela acabou de dizer, mostre que entendeu a situação e retome o contato mais adiante, em um ponto natural da conversa.',
  stop_requesting: 'MOMENTO DA CONVERSA: você já pediu o contato algumas vezes sem resposta. Não peça nome nem telefone de novo. Continue ajudando e aceite o contato apenas se a própria pessoa oferecer.',
  out_of_profile: 'MOMENTO DA CONVERSA: os sinais indicam que a pessoa está fora do perfil atendido. Não peça nome nem telefone. Confirme o que ela procura em uma frase, se ainda houver dúvida, e encerre com educação.',
};
