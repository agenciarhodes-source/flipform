/**
 * The person's own authorization, given in the form, for the company to contact them on WhatsApp.
 * Meta requires it before a business writes first; it names the channel and the company.
 */
export const WHATSAPP_CONSENT_FIELD_TYPE = 'whatsapp_consent';
export const WHATSAPP_CONSENT_VALUE = 'Autorizado';

export function whatsappConsentText(companyName?: string | null) {
  const company = companyName?.trim() || 'a empresa';
  return `Autorizo ${company} a entrar em contato comigo pelo WhatsApp sobre esta solicitação.`;
}

/** Only an explicit "checked" counts; anything else is no authorization. */
export function normalizeWhatsappConsent(value: unknown) {
  return value === true || value === WHATSAPP_CONSENT_VALUE ? WHATSAPP_CONSENT_VALUE : null;
}
