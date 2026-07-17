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


export const FORM_LEAD_SOURCES = [
  { value: 'formulario', label: 'Formulário — sem origem específica' },
  { value: 'paid_traffic', label: 'Tráfego pago' },
  { value: 'meta_ads', label: 'Meta Ads' },
  { value: 'facebook_ads', label: 'Facebook Ads' },
  { value: 'instagram_ads', label: 'Instagram Ads' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'tiktok_ads', label: 'TikTok Ads' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'instagram_direct', label: 'Direct do Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'facebook_messenger', label: 'Messenger do Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'google_business_profile', label: 'Google Meu Negócio' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'referral', label: 'Indicação' },
  { value: 'own_prospecting', label: 'Captação própria' },
  { value: 'other', label: 'Outro canal' },
] as const;

export const FORM_LEAD_SOURCE_VALUES = FORM_LEAD_SOURCES.map((source) => source.value);
export type FormLeadSource = (typeof FORM_LEAD_SOURCES)[number]['value'];

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
  paid_traffic: 'Tráfego pago',
  meta_ads: 'Meta Ads',
  facebook_ads: 'Facebook Ads',
  instagram_ads: 'Instagram Ads',
  google_ads: 'Google Ads',
  tiktok_ads: 'TikTok Ads',
  instagram_direct: 'Direct do Instagram',
  facebook_messenger: 'Messenger do Facebook',
  tiktok: 'TikTok',
  google_business_profile: 'Google Meu Negócio',
  whatsapp: 'WhatsApp',
  other: 'Outro canal',
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
