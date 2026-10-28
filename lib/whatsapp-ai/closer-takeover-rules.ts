/**
 * Switching an attendant from Analyst to Closer: the conversations the Analyst triaged and handed
 * to the team a little before are taken back by the AI as Closer, which continues them (asks the
 * documents, explains the next step). Global for every company. Pure rules, easy to test.
 */

/** WhatsApp only lets the company write freely up to 24 h after the customer's last message. */
export const TAKEOVER_WINDOW_HOURS = 23;
export const TAKEOVER_MAX_PER_SWITCH = 15;

export type TakeoverCandidate = {
  status: string;
  aiPaused: boolean;
  lastInboundAt: Date | null;
  /** The last message sent to the customer was written by the AI. */
  aiSpokeLast: boolean;
  /** That last AI message asks something the customer did not answer yet: waiting, not handed over. */
  aiLastWasQuestion: boolean;
  /** A person of the team wrote in the conversation. */
  teamInvolved: boolean;
  /** The lead's stage: past the first stage (triage passed) and not an outcome stage. */
  stage: { isFirst: boolean; isOutcome: boolean } | null;
};

export function closerTakeoverEligible(candidate: TakeoverCandidate, now: Date) {
  if (candidate.status === 'resolved' || candidate.aiPaused) return false;
  if (!candidate.lastInboundAt || now.getTime() - candidate.lastInboundAt.getTime() > TAKEOVER_WINDOW_HOURS * 3_600_000) return false;
  if (!candidate.aiSpokeLast || candidate.aiLastWasQuestion || candidate.teamInvolved) return false;
  if (!candidate.stage || candidate.stage.isFirst || candidate.stage.isOutcome) return false;
  return true;
}

export const CLOSER_TAKEOVER_NOTE = '[Nota interna, não mostre ao cliente: o seu perfil agora é Closer. Na triagem você tinha passado este'
  + ' caso para a equipe; agora é você quem continua o atendimento. Retome a conversa com naturalidade, sem pedir desculpas pela'
  + ' demora e sem dizer que mudou de perfil. Se a triagem mostrou que o caso tem perfil, diga em uma frase qual é o próximo'
  + ' passo e peça os documentos necessários, com o motivo de cada um, como a base de conhecimento orienta. Se ainda faltar'
  + ' alguma informação da triagem, faça a próxima pergunta.]';
