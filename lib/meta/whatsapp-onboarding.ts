export const WHATSAPP_ONBOARDING_MODES = ['cloud_api', 'coexistence'] as const;
export type WhatsAppOnboardingMode = (typeof WHATSAPP_ONBOARDING_MODES)[number];

export function whatsappOnboardingStateContext(mode: WhatsAppOnboardingMode) {
  return `whatsapp_onboarding:${mode}`;
}

export function isWhatsAppCoexistenceMode(mode: WhatsAppOnboardingMode | null | undefined) {
  return mode === 'coexistence';
}
