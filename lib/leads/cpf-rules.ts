/**
 * The customer's CPF on the lead: read from a document the customer sent (or written in the
 * conversation) and editable by the team, to check later whether the client was registered in the
 * company's other system. Pure rules, easy to test.
 */

export type CpfSource = 'document' | 'chat' | 'team';

export const CPF_SOURCE_LABEL: Record<CpfSource, string> = {
  document: 'lido de um documento enviado pelo cliente',
  chat: 'informado pelo cliente na conversa',
  team: 'preenchido pela equipe',
};

/** Only the 11 digits, or null. */
export function normalizeCpf(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const digits = String(value).replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

/** A real CPF: 11 digits, not all equal, both check digits right. */
export function isValidCpf(value: unknown) {
  const cpf = normalizeCpf(value);
  if (!cpf || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(cpf[index]) * (length + 1 - index);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

/** The valid CPF in its 11 digits, or null. */
export function validCpfOrNull(value: unknown) {
  return isValidCpf(value) ? normalizeCpf(value) : null;
}

export function formatCpf(cpf: string) {
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

/** What everyone who sees the lead may see: the middle digits only. */
export function maskCpf(cpf: string) {
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

/**
 * A CPF the customer wrote: the formatted form (123.456.789-09) anywhere, or 11 loose digits only
 * when the message speaks of CPF (so a phone number is never taken for one).
 */
export function findCpfInText(text: string | null | undefined) {
  if (!text) return null;
  for (const match of text.matchAll(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g)) {
    const cpf = validCpfOrNull(match[0]);
    if (cpf) return cpf;
  }
  if (!/\bcpf\b/i.test(text)) return null;
  for (const match of text.matchAll(/(?<!\d)\d{3}[\s.]?\d{3}[\s.]?\d{3}[\s-]?\d{2}(?!\d)/g)) {
    const cpf = validCpfOrNull(match[0]);
    if (cpf) return cpf;
  }
  return null;
}
