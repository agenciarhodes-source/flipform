/**
 * Reactivation message on WhatsApp: when the customer has been silent for 23 hours after the
 * company's last message, the AI sends one cordial reminder of where the conversation stopped.
 * At 23 hours the 24-hour customer service window is still open, so no paid template is needed.
 * Pure rules, easy to test.
 */
import { isOutcomeStageName } from './stage-rules';

export const REACTIVATION_AFTER_HOURS = 23;
/** The window closes 24 h after the customer's last message; this margin keeps the send inside it. */
export const REACTIVATION_LAST_MINUTE = 23 * 60 + 50;
/** A person of the team who wrote less than this ago is still in the conversation: no reminder. */
export const REACTIVATION_MIN_SILENCE_AFTER_TEAM_MS = 2 * 3_600_000;

export type ReactivationCandidate = {
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  leadStatus: string | null;
  /** The lead's stage: "Não qualificado" or "Já é cliente" never get a reminder. */
  leadStageName?: string | null;
};

/** Whether this conversation is due for its reminder now. */
export function reactivationDue(candidate: ReactivationCandidate, now: Date) {
  if (!candidate.lastInboundAt || !candidate.lastOutboundAt) return false;
  // The company spoke last and the customer did not answer.
  if (candidate.lastOutboundAt <= candidate.lastInboundAt) return false;
  const minutesSinceCustomer = (now.getTime() - candidate.lastInboundAt.getTime()) / 60_000;
  if (minutesSinceCustomer < REACTIVATION_AFTER_HOURS * 60 || minutesSinceCustomer > REACTIVATION_LAST_MINUTE) return false;
  if (now.getTime() - candidate.lastOutboundAt.getTime() < REACTIVATION_MIN_SILENCE_AFTER_TEAM_MS) return false;
  // Closed deals (won or lost) are left alone.
  if (candidate.leadStatus && candidate.leadStatus !== 'open') return false;
  // Not qualified or already a client: a reminder costs and helps no one.
  if (isOutcomeStageName(candidate.leadStageName)) return false;
  return true;
}

/** One reminder per silence: keyed by the customer's last message. */
export function reactivationKey(conversationId: string, lastInboundAt: Date) {
  return `whatsapp-reactivation:${conversationId}:${lastInboundAt.getTime()}`;
}

/** Keeps the reminder short and plain for WhatsApp; empty when the model gave nothing usable. */
export function cleanReactivationText(value: string) {
  return value
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^#+\s*/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 400);
}

// ---------------------------------------------------------------- Same-day reminder (free)

/** The first reminder: after this many hours of silence, inside business hours, still in the free window. */
export const REACTIVATION_EARLY_AFTER_HOURS = 12;
/** The early reminder is not sent this close to the 23-hour one. */
export const REACTIVATION_EARLY_LAST_HOUR = 20;
/** A new silence gets no reminder while one of another silence went out in this time. */
export const REACTIVATION_MIN_GAP_HOURS = 18;

/** A reminder already went out to this conversation too recently. */
export function reminderTooSoon(lastReminderAt: Date | null, now: Date) {
  return Boolean(lastReminderAt && now.getTime() - lastReminderAt.getTime() < REACTIVATION_MIN_GAP_HOURS * 3_600_000);
}
/** Business hours in Brasília, Monday to Saturday. */
export const REACTIVATION_BUSINESS_HOURS = { start: 8, end: 18 } as const;

export function withinBusinessHours(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  return weekday !== 'Sun' && hour >= REACTIVATION_BUSINESS_HOURS.start && hour < REACTIVATION_BUSINESS_HOURS.end;
}

/**
 * The first reminder: the company spoke last, the customer has been silent for 12 hours (and
 * less than 20), nobody of the company wrote in the last 2 hours, and it is business time. Written
 * by the AI, sent inside the free 24-hour window (no paid template).
 */
export function earlyReactivationDue(candidate: ReactivationCandidate, now: Date) {
  if (!candidate.lastInboundAt || !candidate.lastOutboundAt) return false;
  if (candidate.lastOutboundAt <= candidate.lastInboundAt) return false;
  const hours = (now.getTime() - candidate.lastInboundAt.getTime()) / 3_600_000;
  if (hours < REACTIVATION_EARLY_AFTER_HOURS || hours >= REACTIVATION_EARLY_LAST_HOUR) return false;
  if (now.getTime() - candidate.lastOutboundAt.getTime() < REACTIVATION_MIN_SILENCE_AFTER_TEAM_MS) return false;
  if (candidate.leadStatus && candidate.leadStatus !== 'open') return false;
  if (isOutcomeStageName(candidate.leadStageName)) return false;
  return withinBusinessHours(now);
}

export function earlyReactivationKey(conversationId: string, lastInboundAt: Date) {
  return `whatsapp-reactivation-early:${conversationId}:${lastInboundAt.getTime()}`;
}

export type ReactivationMoment = {
  intent?: string | null;
  objection?: string | null;
  journeyStage?: string | null;
  nextAction?: string | null;
};

/**
 * How the AI writes a reminder: from where the conversation stopped, with real help, never
 * generic. It uses the documents still missing, what the conversation engine (JEV) read of the
 * moment and what the memory says is pending.
 */
/** What the reminder writer answers when it must not write now (a time was agreed, nothing pending). */
export const REACTIVATION_SKIP = 'PULAR';

/** The writer decided not to send now. */
export function isReactivationSkip(text: string) {
  return /^[\s*_"'.]*PULAR[\s*_"'.!]*$/i.test(text) || /^\s*PULAR\b/i.test(text.trim());
}

export function reactivationInstructions(input: {
  companyName: string;
  /** Now, in Brasília time, to judge an agreed time ("amanhã"). */
  nowLabel?: string;
  name: string | null;
  kind: 'early' | 'last';
  stageName: string | null;
  documents: string | null;
  moment: ReactivationMoment | null;
  pending: string[];
}) {
  const moment = input.moment
    ? [
      input.moment.intent ? `intenção: ${input.moment.intent}` : '',
      input.moment.objection && input.moment.objection !== 'none' ? `objeção: ${input.moment.objection}` : '',
      input.moment.journeyStage ? `etapa da jornada: ${input.moment.journeyStage}` : '',
      input.moment.nextAction ? `próxima ação sugerida: ${input.moment.nextAction}` : '',
    ].filter(Boolean).join('; ')
    : '';
  return [
    `Você é a assistente de atendimento de ${input.companyName} no WhatsApp e está retomando uma conversa em que o cliente parou de responder.`,
    input.kind === 'early'
      ? 'Ele parou de responder há algumas horas. Escreva UMA mensagem bem curta (1 ou 2 frases, até 160 caracteres), leve, como uma pessoa que volta a chamar: por exemplo "Olá, Maria! Podemos dar continuidade?" ou "Oi, Maria! Conseguiu o extrato do INSS? Podemos continuar?".'
      : 'Ele está sem responder há quase um dia. Escreva UMA mensagem bem curta (1 ou 2 frases, até 160 caracteres) que traga a pessoa de volta, como "Oi, Maria! Ainda dá pra gente seguir com o seu pedido hoje?".',
    input.nowLabel ? `Agora é ${input.nowLabel} (horário de Brasília). Cada mensagem do histórico tem a data e a hora.` : '',
    input.name ? `Chame o cliente de ${input.name}.` : 'Não use nome.',
    'COMO RETOMAR (obrigatório):',
    '- Se ajudar, cite em poucas palavras o que ficou pendente (um documento, uma resposta). Não repita a lista inteira nem o que já foi dito. Nunca pergunte "ainda tem interesse?".',
    '- Sem explicar demais: nada de "vi que...", "entendo que pode ter surgido alguma dificuldade", "recebi...". Uma pergunta simples basta.',
    '- Se faltam documentos, cite no máximo um ("o extrato do INSS") ou ofereça ajuda em poucas palavras ("quer que eu te explique como tirar?").',
    `- PRAZO COMBINADO: se o cliente disse que vai mandar ou responder depois (amanhã, quando a escola entregar, quando receber, semana que vem, depois do trabalho...) e a empresa concordou, NÃO retome antes desse prazo: responda só a palavra ${REACTIVATION_SKIP}. Só retome quando o prazo combinado já passou (por exemplo, disse "amanhã" e já é outro dia), lembrando do que ele combinou.`,
    `- Se o cliente só agradeceu ou confirmou e não ficou nada pendente com ele, ou se a equipe já retomou a conversa depois da última mensagem dele, responda só ${REACTIVATION_SKIP}.`,
    '- NÃO REPITA: leia as mensagens da empresa no histórico e não use de novo as mesmas frases, pedidos ou explicações. Diga algo novo e útil (uma ajuda concreta, uma dúvida respondida).',
    '- Só na segunda mensagem (a de quase um dia), e só se a empresa ainda não disse isso, pode dizer em poucas palavras que quanto antes os documentos chegarem, mais rápido o pedido entra.',
    '- Se havia uma dúvida, um receio ou uma objeção, responda a ela primeiro, com segurança e confiança, antes de pedir qualquer coisa.',
    '- Fale sempre em "nosso time" (o nosso time avalia, o nosso time cuida disso). PROIBIDO dizer "vou encaminhar", "vou chamar um atendente", "um atendente vai falar com você" ou "vou transferir".',
    '- Não se apresente de novo, não pressione, não prometa resultado, prazo nem valor, não invente nada que não está na conversa e não use listas.',
    input.stageName ? `Momento do atendimento (não cite este nome): ${input.stageName}.` : '',
    moment ? `Leitura do momento da conversa (não cite estes termos): ${moment}.` : '',
    input.documents ? `Situação dos documentos (use para saber o que falta; não copie este texto):\n${input.documents}` : '',
    input.pending.length ? `Pendências anotadas na conversa: ${input.pending.join('; ')}.` : '',
    'Escreva só a mensagem, em português do Brasil, pronta para enviar.',
  ].filter(Boolean).join('\n');
}
