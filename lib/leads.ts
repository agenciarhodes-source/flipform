export const MANUAL_LEAD_SOURCES = [
  { value: 'referral', label: 'Indicação' },
  { value: 'own_prospecting', label: 'Captação própria' },
  { value: 'google', label: 'Google' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'visit', label: 'Visita' },
  { value: 'call_center', label: 'Call center' },
] as const;

export const MANUAL_LEAD_SOURCE_VALUES = MANUAL_LEAD_SOURCES.map((source) => source.value);

const LEAD_SOURCE_LABELS: Record<string, string> = {
  formulario: 'Formulário',
  form: 'Formulário',
  public_form: 'Formulário',
  referral: 'Indicação',
  own_prospecting: 'Captação própria',
  google: 'Google',
  facebook: 'Facebook',
  instagram: 'Instagram',
  visit: 'Visita',
  call_center: 'Call center',
};

export function formatLeadSource(source?: string | null): string {
  if (!source) return 'Outro';
  const normalized = source.trim().toLowerCase();
  if (LEAD_SOURCE_LABELS[normalized]) return LEAD_SOURCE_LABELS[normalized];
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

export function normalizeEmail(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

export function normalizeBrazilianPhone(phone?: string | null): string | null {
  const digits = phone?.replace(/\D/g, '') || '';
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
  return digits;
}

export function isValidBrazilianPhone(phone: string): boolean {
  return /^55\d{10,11}$/.test(phone);
}
