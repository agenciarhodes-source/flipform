import { isValidCnpj, isValidCpf } from '@/lib/form-field-validation';

/**
 * CPF and CNPJ protection (security protocol S7, LGPD and ISO 27018). Pure functions, easy to test.
 * - Texts sent to the AI provider never carry the numbers: the AI learns that a document was
 *   given, not which one (the team still sees it in the Inbox).
 * - Form answers of CPF/CNPJ fields are kept encrypted, shown masked.
 */

export const CPF_PLACEHOLDER = '[CPF informado]';
export const CNPJ_PLACEHOLDER = '[CNPJ informado]';

const CNPJ_PATTERN = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

/**
 * Replaces CPF and CNPJ numbers in a text. Only numbers with valid check digits are replaced, so
 * phone numbers, dates and amounts stay as they are.
 */
export function maskDocumentNumbers(text: string) {
  if (!/\d{2}/.test(text)) return text;
  return text
    .replace(CNPJ_PATTERN, (match) => (isValidCnpj(match) ? CNPJ_PLACEHOLDER : match))
    .replace(CPF_PATTERN, (match) => (isValidCpf(match) ? CPF_PLACEHOLDER : match));
}

/** 12345678901 -> ***.456.789-** */
export function maskCpf(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return '***.***.***-**';
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

/** 12345678000190 -> **.345.678/0001-** */
export function maskCnpj(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14) return '**.***.***/****-**';
  return `**.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-**`;
}

export type ProtectedDocumentAnswer = { protected: 'cpf' | 'cnpj'; masked: string; encrypted: string };

export function isProtectedAnswer(answer: unknown): answer is ProtectedDocumentAnswer {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return false;
  const value = answer as Record<string, unknown>;
  return (value.protected === 'cpf' || value.protected === 'cnpj')
    && typeof value.masked === 'string' && typeof value.encrypted === 'string';
}

/** The text of a form answer for screens, summaries and the AI: protected documents stay masked. */
export function answerDisplayText(answer: unknown) {
  if (isProtectedAnswer(answer)) return answer.masked;
  if (answer === null || answer === undefined) return '';
  if (typeof answer === 'string') return answer;
  return JSON.stringify(answer);
}

/** The masked form of a document typed in a CPF or CNPJ field. */
export function maskedDocument(fieldType: 'cpf' | 'cnpj', value: string) {
  return fieldType === 'cpf' ? maskCpf(value) : maskCnpj(value);
}
