import type { FlipAiConversationDecision } from './decision-engine';

/**
 * When to ask for name and phone. Deterministic: it reads how many times the agent
 * already asked, how long ago, and the JEV reading of the conversation moment.
 * Whether someone is out of profile is never decided here: only the attendant judges that,
 * from what the person actually said.
 * It only shapes the guidance given to the model; it never creates or changes a Lead.
 */

export const FLIP_AI_CONTACT_MAX_REQUESTS = 3;
/** Replies the agent must give after an unanswered request before asking again. */
export const FLIP_AI_CONTACT_COOLDOWN_REPLIES = 2;
/** Without a clear buying signal, the agent still asks once the visitor sent this many messages. */
export const FLIP_AI_CONTACT_FALLBACK_INBOUND_MESSAGES = 4;

export type FlipAiContactMoment =
  | 'discover_first'
  | 'ask_now'
  | 'handle_objection_first'
  | 'hold_after_request'
  | 'stop_requesting';

const CONTACT_REQUEST_PATTERN = new RegExp([
  'como (voc[eê]|vc) se chama',
  'como (eu )?(posso )?te cham(ar|o)',
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

  if (requests >= FLIP_AI_CONTACT_MAX_REQUESTS) return 'stop_requesting';
  if (repliesSinceLastRequest !== null && repliesSinceLastRequest < FLIP_AI_CONTACT_COOLDOWN_REPLIES) {
    return 'hold_after_request';
  }

  if (!decision) {
    // No reading of the moment: keep the simple rule based on how much the person already said.
    return input.inboundMessages >= 3 ? 'ask_now' : 'discover_first';
  }
  // The engine labels plain questions (price, deadline, reports) with an objection topic, often with
  // high confidence. It is only treated as a real objection when the intent itself is an objection.
  if (decision.intent === 'objection' && decision.objection !== 'none') return 'handle_objection_first';
  if (input.inboundMessages >= 2 && isBuyingMoment(decision)) return 'ask_now';
  if (input.inboundMessages >= FLIP_AI_CONTACT_FALLBACK_INBOUND_MESSAGES) return 'ask_now';
  return 'discover_first';
}

export const FLIP_AI_CONTACT_GUIDANCE: Record<FlipAiContactMoment, string> = {
  discover_first: 'Faça descoberta mínima, em forma de triagem rápida: responda ao que a pessoa perguntou e faça uma única pergunta, a que mais define se ela faz parte do público que a empresa atende segundo a base interna (por exemplo, o tipo de negócio, a situação ou o requisito que a empresa exige). Não faça perguntas genéricas de diagnóstico. A conversa inteira comporta no máximo duas perguntas de triagem. Não segure o contato: se a pessoa já demonstrou interesse claro ou já respondeu a uma pergunta de triagem, peça nome e telefone nesta mesma resposta. Se a própria pessoa oferecer o contato, aceite.',
  ask_now: 'CAPTURA PRIORITÁRIA: este é o momento de identificar a pessoa, e o contato não pode ser adiado. Responda brevemente à dúvida direta, se houver, e peça agora o dado de contato que falta, dizendo para que ele serve, sem abrir outra sequência de diagnóstico. Se você ainda não sabe se a pessoa faz parte do público que a empresa atende, inclua antes do pedido uma única pergunta curta de triagem, na mesma resposta, e nunca troque o pedido de contato por ela. Só adie o contato por segurança.',
  handle_objection_first: 'MOMENTO DA CONVERSA: a pessoa trouxe uma objeção. Não peça nome nem telefone nesta resposta. Reconheça o ponto, responda ao motivo real da resistência e só volte ao contato depois que a objeção estiver tratada.',
  hold_after_request: 'MOMENTO DA CONVERSA: você pediu o contato há pouco e a pessoa não informou. Não repita o pedido nesta resposta. Responda de verdade ao que ela acabou de dizer, mostre que entendeu a situação e retome o contato mais adiante, em um ponto natural da conversa.',
  stop_requesting: 'MOMENTO DA CONVERSA: você já pediu o contato algumas vezes sem resposta. Não peça nome nem telefone de novo. Continue ajudando e aceite o contato apenas se a própria pessoa oferecer.',
};

/** Moments in which asking again would push the person away. Triage never blocks the contact. */
const CONTACT_BLOCKED_MOMENTS: FlipAiContactMoment[] = ['handle_objection_first', 'hold_after_request', 'stop_requesting'];

/**
 * Holds the reply to the moments in which the contact must not be asked: an open objection, a
 * request made a moment ago, or too many requests already. There, any sentence asking for name or
 * phone is taken out before the reply is shown. During triage the request is never removed:
 * capturing the lead comes first. Nothing else in the reply is changed.
 */
export function enforceContactMoment(reply: string, moment: FlipAiContactMoment | null | undefined) {
  if (!moment || !CONTACT_BLOCKED_MOMENTS.includes(moment)) return reply;
  const blocks = reply.split(/\r?\n\s*\r?\n/)
    .map((block) => block
      .split(/(?<=[.!?…])\s+/)
      .filter((sentence) => !isContactRequest(sentence))
      .join(' ')
      .trim())
    .filter(Boolean);
  // A reply that was nothing but the request is kept as written rather than sent empty.
  return blocks.join('\n\n') || reply;
}
