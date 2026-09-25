export const EXTERNAL_LEAD_SOURCES = [
  { value: 'paid_traffic', label: 'Tráfego pago' },
  { value: 'meta_ads', label: 'Meta Ads' },
  { value: 'facebook_ads', label: 'Facebook Ads' },
  { value: 'instagram_ads', label: 'Instagram Ads' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'tiktok_ads', label: 'TikTok Ads' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'instagram_direct', label: 'Direct Message do Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'facebook_messenger', label: 'Messenger do Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'google', label: 'Google' },
  { value: 'google_business_profile', label: 'Google Meu Negócio' },
  { value: 'site', label: 'Site' },
  { value: 'customer_service', label: 'Atendimento' },
  { value: 'referral', label: 'Indicação' },
  { value: 'own_prospecting', label: 'Captação própria' },
  { value: 'visit', label: 'Visita' },
  { value: 'call_center', label: 'Call center' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'other', label: 'Outro canal' },
] as const;
export const MANUAL_LEAD_SOURCES = EXTERNAL_LEAD_SOURCES;

export const MANUAL_LEAD_SOURCE_VALUES = MANUAL_LEAD_SOURCES.map((source) => source.value);


export const FORM_LEAD_SOURCES = [
  { value: 'formulario', label: 'Formulário — sem origem específica' },
  ...EXTERNAL_LEAD_SOURCES,
] as const;

export const FORM_LEAD_SOURCE_VALUES = FORM_LEAD_SOURCES.map((source) => source.value);
export type FormLeadSource = (typeof FORM_LEAD_SOURCES)[number]['value'];

const LEAD_SOURCE_LABELS: Record<string, string> = {
  ...Object.fromEntries(FORM_LEAD_SOURCES.map(({ value, label }) => [value, label])),
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
  paid_traffic: 'Tráfego pago',
  meta_ads: 'Meta Ads',
  facebook_ads: 'Facebook Ads',
  instagram_ads: 'Instagram Ads',
  google_ads: 'Google Ads',
  tiktok_ads: 'TikTok Ads',
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

export function getBrazilianPhoneAliases(phone?: string | null): string[] {
  const normalized = normalizeBrazilianPhone(phone);
  if (!normalized || !isValidBrazilianPhone(normalized)) return normalized ? [normalized] : [];

  const aliases = new Set<string>();
  const add = (value: string) => {
    aliases.add(value);
    if (value.startsWith('55')) aliases.add(value.slice(2));
  };

  add(normalized);

  // Brazilian mobile numbers can appear in WhatsApp/legacy data with or without
  // the additional ninth digit. Only infer the old/new mobile counterpart when
  // the subscriber number is mobile-like (6-9), avoiding fixed-line 2-5 ranges.
  if (normalized.length === 13 && normalized[4] === '9') {
    add(`${normalized.slice(0, 4)}${normalized.slice(5)}`);
  } else if (normalized.length === 12 && /^[6-9]$/.test(normalized[4])) {
    add(`${normalized.slice(0, 4)}9${normalized.slice(4)}`);
  }

  return [...aliases];
}

export function normalizeBrazilianLeadPhone(phone?: string | null): string | null {
  const normalized = normalizeBrazilianPhone(phone);
  if (!normalized) return null;

  // Prefer the current Brazilian mobile representation in CRM data while still
  // preserving landlines and non-mobile-shaped numbers exactly as normalized.
  if (normalized.length === 12 && /^[6-9]$/.test(normalized[4])) {
    return `${normalized.slice(0, 4)}9${normalized.slice(4)}`;
  }
  return normalized;
}
