export const META_ADS_ONBOARDING_PURPOSE = 'ads_tracking' as const;
export const META_WHATSAPP_ONBOARDING_PURPOSE = 'whatsapp_embedded_signup' as const;
export const META_INSTAGRAM_ONBOARDING_PURPOSE = 'instagram_business_login' as const;

export const META_ONBOARDING_PURPOSES = [
  META_ADS_ONBOARDING_PURPOSE,
  META_WHATSAPP_ONBOARDING_PURPOSE,
  META_INSTAGRAM_ONBOARDING_PURPOSE,
] as const;

export type MetaOnboardingPurpose = (typeof META_ONBOARDING_PURPOSES)[number];

export const META_ONBOARDING_CHANNELS = {
  [META_ADS_ONBOARDING_PURPOSE]: {
    channel: 'ads',
    flow: 'facebook_login_for_business',
    requiredScopes: ['ads_read', 'ads_management', 'business_management'],
    persistence: 'tenant_meta_connections',
  },
  [META_WHATSAPP_ONBOARDING_PURPOSE]: {
    channel: 'whatsapp',
    flow: 'whatsapp_embedded_signup',
    requiredScopes: ['business_management', 'whatsapp_business_management', 'whatsapp_business_messaging'],
    persistence: 'tenant_whatsapp_connections',
  },
  [META_INSTAGRAM_ONBOARDING_PURPOSE]: {
    channel: 'instagram',
    flow: 'instagram_business_login',
    requiredScopes: ['instagram_business_basic', 'instagram_business_manage_messages'],
    persistence: 'separate_channel_connection_required',
  },
} as const;

export function isMetaOnboardingPurpose(value: unknown): value is MetaOnboardingPurpose {
  return typeof value === 'string' && META_ONBOARDING_PURPOSES.some(purpose => purpose === value);
}

export function getMetaOnboardingChannel(purpose: MetaOnboardingPurpose) {
  return META_ONBOARDING_CHANNELS[purpose];
}
