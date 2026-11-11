import { z } from 'zod';

/**
 * "Ligar" on the lead card: the attendant calls from the phone (or opens WhatsApp) and records how
 * the call went. The record shows in the customer summary; a "call back later" becomes a task.
 * Global for every company. Pure rules, easy to test.
 */

export const CALL_OUTCOMES = {
  answered: 'Atendeu',
  no_answer: 'Não atendeu',
  voicemail: 'Caixa postal',
  callback: 'Pediu para ligar depois',
  wrong_number: 'Número errado',
} as const;
export type CallOutcome = keyof typeof CALL_OUTCOMES;

export const callSchema = z.object({
  outcome: z.enum(Object.keys(CALL_OUTCOMES) as [CallOutcome, ...CallOutcome[]]),
  note: z.string().trim().max(1000, 'A anotação pode ter até 1000 caracteres.').default(''),
  /** When to call again (ISO); required when the customer asked to be called later. */
  callbackAt: z.string().datetime({ offset: true }).nullable().optional(),
  /** Open call tasks of this lead that this call finishes. */
  completeTaskIds: z.array(z.string().min(1).max(64)).max(10).default([]),
}).refine((value) => value.outcome !== 'callback' || Boolean(value.callbackAt), {
  message: 'Escolha quando ligar de novo.',
  path: ['callbackAt'],
});

/** Digits of a Brazilian number with the country code, or null. */
export function brazilianDigits(phone: string | null | undefined) {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
  return null;
}

/** Link that starts the call on the attendant's phone. */
export function dialHref(phone: string | null | undefined) {
  const digits = brazilianDigits(phone);
  return digits ? `tel:+${digits}` : null;
}

/** Link that opens the customer on WhatsApp (to call from there). */
export function whatsappHref(phone: string | null | undefined) {
  const digits = brazilianDigits(phone);
  return digits ? `https://wa.me/${digits}` : null;
}

/** A task that asks for a call ("Ligar para...", "ligação"). */
export function isCallTaskTitle(title: string) {
  return /\bligar\b|liga[cç][aã]o|ligue|telefonar/i.test(title);
}

/** The line of the customer summary for one call. */
export function callStoryText(input: { outcome: string; userName: string | null; note: string | null }) {
  const label = CALL_OUTCOMES[input.outcome as CallOutcome] || 'Ligação';
  const note = (input.note || '').replace(/\s+/g, ' ').trim();
  return `Ligação: ${label.toLowerCase()}${input.userName ? ` (${input.userName})` : ''}${note ? ` — ${note.length > 90 ? `${note.slice(0, 89)}…` : note}` : ''}`;
}
