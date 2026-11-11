import { z } from 'zod';

/**
 * "Corrigir" a message the team sent on WhatsApp. The WhatsApp API does not edit a sent message,
 * so the customer gets a new one that quotes the wrong one ("✏️ Correção: ..."); in FlipForm the
 * original shows the corrected text, marked "editada", with the history of versions (only the
 * team sees it). Only text messages written by a person of the team. Pure rules, easy to test.
 */

export const CORRECTION_PREFIX = '✏️ *Correção:* ';
export const CORRECTION_WINDOW_MS = 24 * 3_600_000;

export const correctionSchema = z.object({
  text: z.string().trim().min(1, 'Escreva o texto certo.').max(4000, 'O texto pode ter até 4000 caracteres.'),
});

export type CorrectionTarget = {
  direction: string;
  channel: string;
  type: string;
  status: string;
  sentByUserId: string | null;
  providerMessageId: string | null;
};

/** Why this message cannot be corrected, or null when it can. */
export function correctionBlock(input: {
  message: CorrectionTarget;
  lastInboundAt: Date | null;
  requesterId: string;
  requesterRole: string;
  now: Date;
}) {
  const { message } = input;
  if (message.direction !== 'outbound' || !message.sentByUserId) return 'Só dá para corrigir mensagens enviadas pela equipe.';
  if (message.channel !== 'whatsapp') return 'A correção é só para o WhatsApp.';
  if (message.type !== 'text') return 'Só dá para corrigir mensagens de texto.';
  if (message.status === 'failed' || !message.providerMessageId) return 'Esta mensagem não foi entregue ao WhatsApp.';
  const manager = ['owner', 'admin', 'manager'].includes(input.requesterRole);
  if (!manager && message.sentByUserId !== input.requesterId) return 'Você só pode corrigir as suas próprias mensagens.';
  if (!input.lastInboundAt || input.now.getTime() - input.lastInboundAt.getTime() > CORRECTION_WINDOW_MS) {
    return 'O WhatsApp só permite mensagens livres até 24 horas depois da última mensagem do cliente.';
  }
  return null;
}

/** What the customer receives, as a reply to the wrong message. */
export function correctionText(text: string) {
  return `${CORRECTION_PREFIX}${text.trim()}`;
}

/** The correction message itself (shown smaller in the Inbox). */
export function isCorrectionText(text: string | null | undefined) {
  return Boolean(text && text.startsWith(CORRECTION_PREFIX));
}
