/**
 * Sending a form is the person's authorization for the company to contact them on WhatsApp about
 * that request. Meta accepts any clear opt-in that names the channel and the company; the notice
 * below the form says both, and each submission is recorded with the exact text shown.
 */
export const CONTACT_CONSENT_ACTION = 'lead.contact_consent_recorded';
export const CONTACT_CONSENT_NOTICE_VERSION = '2026-10-15.2';

export function contactConsentNotice(companyName?: string | null) {
  const company = companyName?.trim() || 'a empresa';
  return `Ao enviar, você autoriza ${company} a entrar em contato com você pelo WhatsApp. Seus dados não são compartilhados com terceiros.`;
}
