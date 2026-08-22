import 'server-only';
import { prisma } from '@/lib/prisma';
import { decryptIntegrationSecret, encryptIntegrationSecret, looksMaskedSecret, maskSecretFromEncrypted } from '@/lib/tracking/crypto';

export const PLATFORM_META_SETTINGS_ID = 'meta';
export const META_OAUTH_CALLBACK_PATH = '/api/integrations/meta/callback';

export type PlatformMetaSettingsInput = {
  appId: string;
  appSecret?: string;
  businessLoginConfigId: string;
  instagramAppId?: string;
  instagramAppSecret?: string;
  whatsappEmbeddedSignupConfigId: string;
  whatsappBusinessId: string;
  whatsappSystemUserId: string;
  whatsappAdminSystemUserAccessToken?: string;
  whatsappSystemUserAccessToken?: string;
  defaultPixelEnabled: boolean;
  defaultCapiEnabled: boolean;
  defaultAdvancedMatchingEnabled: boolean;
  defaultAttributionEnabled: boolean;
  defaultQualifiedLeadEnabled: boolean;
  defaultPurchaseEnabled: boolean;
};

export type PlatformInstagramSettingsInput = {
  instagramAppId: string;
  instagramAppSecret?: string;
};

const DEFAULTS = {
  defaultPixelEnabled: true, defaultCapiEnabled: true,
  defaultAdvancedMatchingEnabled: true, defaultAttributionEnabled: true,
  defaultQualifiedLeadEnabled: true, defaultPurchaseEnabled: true,
};

const WHATSAPP_PLATFORM_SELECT = {
  appId: true,
  appSecretEncrypted: true,
  whatsappEmbeddedSignupConfigId: true,
  whatsappBusinessId: true,
  whatsappSystemUserId: true,
  whatsappAdminSystemUserAccessTokenEncrypted: true,
  whatsappSystemUserAccessTokenEncrypted: true,
} as const;

type WhatsAppPlatformSettings = {
  appId: string | null;
  appSecretEncrypted: string | null;
  whatsappEmbeddedSignupConfigId: string | null;
  whatsappBusinessId: string | null;
  whatsappSystemUserId: string | null;
  whatsappAdminSystemUserAccessTokenEncrypted: string | null;
  whatsappSystemUserAccessTokenEncrypted: string | null;
};

function hasWhatsAppPlatformConfig(settings: WhatsAppPlatformSettings | null | undefined) {
  return Boolean(
    settings?.appId
    && settings.appSecretEncrypted
    && settings.whatsappEmbeddedSignupConfigId
    && settings.whatsappBusinessId
    && settings.whatsappSystemUserId
    && settings.whatsappAdminSystemUserAccessTokenEncrypted
    && settings.whatsappSystemUserAccessTokenEncrypted
  );
}

export function getMetaOAuthRedirectUri() {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${META_OAUTH_CALLBACK_PATH}`;
}

function toAdminDto(settings: any | null) {
  const appSecretEncrypted = settings?.appSecretEncrypted || null;
  const instagramAppSecretEncrypted = settings?.instagramAppSecretEncrypted || null;
  const whatsappAdminTokenEncrypted = settings?.whatsappAdminSystemUserAccessTokenEncrypted || null;
  const whatsappRuntimeTokenEncrypted = settings?.whatsappSystemUserAccessTokenEncrypted || null;
  const appId = settings?.appId || null;
  const instagramAppId = settings?.instagramAppId || null;
  const businessLoginConfigId = settings?.businessLoginConfigId || null;
  const whatsappEmbeddedSignupConfigId = settings?.whatsappEmbeddedSignupConfigId || null;
  const whatsappBusinessId = settings?.whatsappBusinessId || null;
  const whatsappSystemUserId = settings?.whatsappSystemUserId || null;
  return {
    appId,
    businessLoginConfigId,
    instagramAppId,
    whatsappEmbeddedSignupConfigId,
    whatsappBusinessId,
    whatsappSystemUserId,
    appSecretConfigured: Boolean(appSecretEncrypted),
    appSecretMasked: maskSecretFromEncrypted(appSecretEncrypted),
    instagramAppSecretConfigured: Boolean(instagramAppSecretEncrypted),
    instagramAppSecretMasked: maskSecretFromEncrypted(instagramAppSecretEncrypted),
    whatsappAdminSystemUserAccessTokenConfigured: Boolean(whatsappAdminTokenEncrypted),
    whatsappAdminSystemUserAccessTokenMasked: maskSecretFromEncrypted(whatsappAdminTokenEncrypted),
    whatsappSystemUserAccessTokenConfigured: Boolean(whatsappRuntimeTokenEncrypted),
    whatsappSystemUserAccessTokenMasked: maskSecretFromEncrypted(whatsappRuntimeTokenEncrypted),
    redirectUri: getMetaOAuthRedirectUri(),
    ...DEFAULTS,
    ...(settings ? {
      defaultPixelEnabled: settings.defaultPixelEnabled,
      defaultCapiEnabled: settings.defaultCapiEnabled,
      defaultAdvancedMatchingEnabled: settings.defaultAdvancedMatchingEnabled,
      defaultAttributionEnabled: settings.defaultAttributionEnabled,
      defaultQualifiedLeadEnabled: settings.defaultQualifiedLeadEnabled,
      defaultPurchaseEnabled: settings.defaultPurchaseEnabled,
    } : {}),
    baseConfigured: Boolean(appId && appSecretEncrypted),
    businessLoginConfigured: Boolean(appId && appSecretEncrypted && businessLoginConfigId),
    instagramLoginConfigured: Boolean(instagramAppId && instagramAppSecretEncrypted),
    whatsappEmbeddedSignupConfigured: hasWhatsAppPlatformConfig(settings),
    configured: Boolean(appId && appSecretEncrypted),
    updatedAt: settings?.updatedAt || null,
    updatedBy: settings?.updatedBy || null,
  };
}

export async function getPlatformMetaSettingsForAdmin() {
  const settings = await prisma.platformMetaSettings.findUnique({
    where: { id: PLATFORM_META_SETTINGS_ID },
    include: { updatedBy: { select: { id: true, name: true, email: true } } },
  });
  return toAdminDto(settings);
}

function toInstagramAdminDto(settings: {
  instagramAppId: string | null;
  instagramAppSecretEncrypted: string | null;
  updatedAt: Date;
} | null) {
  const instagramAppSecretEncrypted = settings?.instagramAppSecretEncrypted || null;
  return {
    instagramAppId: settings?.instagramAppId || null,
    instagramAppSecretConfigured: Boolean(instagramAppSecretEncrypted),
    instagramAppSecretMasked: maskSecretFromEncrypted(instagramAppSecretEncrypted),
    configured: Boolean(settings?.instagramAppId && instagramAppSecretEncrypted),
    updatedAt: settings?.updatedAt || null,
  };
}

export async function getPlatformInstagramSettingsForAdmin() {
  const settings = await prisma.platformMetaSettings.findUnique({
    where: { id: PLATFORM_META_SETTINGS_ID },
    select: {
      instagramAppId: true,
      instagramAppSecretEncrypted: true,
      updatedAt: true,
    },
  });
  return toInstagramAdminDto(settings);
}

export async function isPlatformMetaBaseAvailable() {
  const settings = await prisma.platformMetaSettings.findUnique({ where: { id: PLATFORM_META_SETTINGS_ID }, select: { appId: true, appSecretEncrypted: true } });
  return Boolean(settings?.appId && settings.appSecretEncrypted);
}

export async function isPlatformMetaBusinessLoginAvailable() {
  const settings = await prisma.platformMetaSettings.findUnique({ where: { id: PLATFORM_META_SETTINGS_ID }, select: { appId: true, appSecretEncrypted: true, businessLoginConfigId: true } });
  return Boolean(settings?.appId && settings.appSecretEncrypted && settings.businessLoginConfigId);
}

export async function isPlatformWhatsAppEmbeddedSignupAvailable() {
  const settings = await prisma.platformMetaSettings.findUnique({
    where: { id: PLATFORM_META_SETTINGS_ID },
    select: WHATSAPP_PLATFORM_SELECT,
  });
  return hasWhatsAppPlatformConfig(settings);
}

export async function isPlatformWhatsAppRuntimeAvailable() {
  const settings = await prisma.platformMetaSettings.findUnique({
    where: { id: PLATFORM_META_SETTINGS_ID },
    select: {
      appId: true,
      appSecretEncrypted: true,
      whatsappSystemUserAccessTokenEncrypted: true,
    },
  });
  return Boolean(
    settings?.appId
    && settings.appSecretEncrypted
    && settings.whatsappSystemUserAccessTokenEncrypted
  );
}

export async function getPlatformWhatsAppEmbeddedSignupClientConfig() {
  const settings = await prisma.platformMetaSettings.findUnique({
    where: { id: PLATFORM_META_SETTINGS_ID },
    select: WHATSAPP_PLATFORM_SELECT,
  });
  if (!hasWhatsAppPlatformConfig(settings) || !settings?.appId || !settings.whatsappEmbeddedSignupConfigId) return null;
  return {
    appId: settings.appId,
    configId: settings.whatsappEmbeddedSignupConfigId,
  };
}

/** @deprecated Prefer the explicitly named base/business readiness helpers. */
export const isPlatformMetaAvailable = isPlatformMetaBaseAvailable;

export async function getPlatformMetaOAuthCredentials() {
  const settings = await prisma.platformMetaSettings.findUnique({ where: { id: PLATFORM_META_SETTINGS_ID }, select: { appId: true, appSecretEncrypted: true, businessLoginConfigId: true } });
  const appSecret = decryptIntegrationSecret(settings?.appSecretEncrypted);
  if (!settings?.appId || !appSecret) return null;
  return { appId: settings.appId, appSecret, businessLoginConfigId: settings.businessLoginConfigId };
}

export async function getPlatformWhatsAppEmbeddedSignupCredentials() {
  const settings = await prisma.platformMetaSettings.findUnique({
    where: { id: PLATFORM_META_SETTINGS_ID },
    select: WHATSAPP_PLATFORM_SELECT,
  });
  if (!hasWhatsAppPlatformConfig(settings)) return null;
  const appSecret = decryptIntegrationSecret(settings?.appSecretEncrypted);
  const adminSystemUserAccessToken = decryptIntegrationSecret(settings?.whatsappAdminSystemUserAccessTokenEncrypted);
  const systemUserAccessToken = decryptIntegrationSecret(settings?.whatsappSystemUserAccessTokenEncrypted);
  if (
    !settings?.appId
    || !appSecret
    || !settings.whatsappEmbeddedSignupConfigId
    || !settings.whatsappBusinessId
    || !settings.whatsappSystemUserId
    || !adminSystemUserAccessToken
    || !systemUserAccessToken
  ) return null;
  return {
    appId: settings.appId,
    appSecret,
    configId: settings.whatsappEmbeddedSignupConfigId,
    businessId: settings.whatsappBusinessId,
    systemUserId: settings.whatsappSystemUserId,
    adminSystemUserAccessToken,
    systemUserAccessToken,
  };
}

export async function getPlatformWhatsAppRuntimeCredentials() {
  const settings = await prisma.platformMetaSettings.findUnique({
    where: { id: PLATFORM_META_SETTINGS_ID },
    select: {
      appId: true,
      appSecretEncrypted: true,
      whatsappSystemUserAccessTokenEncrypted: true,
    },
  });
  const appSecret = decryptIntegrationSecret(settings?.appSecretEncrypted);
  const systemUserAccessToken = decryptIntegrationSecret(settings?.whatsappSystemUserAccessTokenEncrypted);
  if (!settings?.appId || !appSecret || !systemUserAccessToken) return null;
  return {
    appId: settings.appId,
    appSecret,
    systemUserAccessToken,
  };
}

export async function updatePlatformInstagramSettings(input: PlatformInstagramSettingsInput, updatedById: string) {
  const existing = await prisma.platformMetaSettings.findUnique({
    where: { id: PLATFORM_META_SETTINGS_ID },
    select: { instagramAppSecretEncrypted: true },
  });
  let instagramAppSecretEncrypted = existing?.instagramAppSecretEncrypted || null;
  if (input.instagramAppSecret && !looksMaskedSecret(input.instagramAppSecret)) {
    instagramAppSecretEncrypted = encryptIntegrationSecret(input.instagramAppSecret);
  }

  await prisma.platformMetaSettings.upsert({
    where: { id: PLATFORM_META_SETTINGS_ID },
    create: {
      id: PLATFORM_META_SETTINGS_ID,
      instagramAppId: input.instagramAppId || null,
      instagramAppSecretEncrypted,
      updatedById,
    },
    update: {
      instagramAppId: input.instagramAppId || null,
      instagramAppSecretEncrypted,
      updatedById,
    },
  });
  return getPlatformInstagramSettingsForAdmin();
}

export async function updatePlatformMetaSettings(input: PlatformMetaSettingsInput, updatedById: string) {
  const existing = await prisma.platformMetaSettings.findUnique({
    where: { id: PLATFORM_META_SETTINGS_ID },
    select: {
      appSecretEncrypted: true,
      instagramAppId: true,
      instagramAppSecretEncrypted: true,
      whatsappAdminSystemUserAccessTokenEncrypted: true,
      whatsappSystemUserAccessTokenEncrypted: true,
    },
  });
  let appSecretEncrypted = existing?.appSecretEncrypted || null;
  let whatsappAdminSystemUserAccessTokenEncrypted = existing?.whatsappAdminSystemUserAccessTokenEncrypted || null;
  let whatsappSystemUserAccessTokenEncrypted = existing?.whatsappSystemUserAccessTokenEncrypted || null;

  if (input.appSecret && !looksMaskedSecret(input.appSecret)) appSecretEncrypted = encryptIntegrationSecret(input.appSecret);
  if (input.whatsappAdminSystemUserAccessToken && !looksMaskedSecret(input.whatsappAdminSystemUserAccessToken)) {
    whatsappAdminSystemUserAccessTokenEncrypted = encryptIntegrationSecret(input.whatsappAdminSystemUserAccessToken);
  }
  if (input.whatsappSystemUserAccessToken && !looksMaskedSecret(input.whatsappSystemUserAccessToken)) {
    whatsappSystemUserAccessTokenEncrypted = encryptIntegrationSecret(input.whatsappSystemUserAccessToken);
  }

  const {
    appSecret: _appSecret,
    instagramAppId: _instagramAppId,
    instagramAppSecret: _instagramAppSecret,
    whatsappAdminSystemUserAccessToken: _adminToken,
    whatsappSystemUserAccessToken: _runtimeToken,
    ...safeInput
  } = input;
  const secretData = {
    appSecretEncrypted,
    whatsappAdminSystemUserAccessTokenEncrypted,
    whatsappSystemUserAccessTokenEncrypted,
  };
  await prisma.platformMetaSettings.upsert({
    where: { id: PLATFORM_META_SETTINGS_ID },
    create: {
      id: PLATFORM_META_SETTINGS_ID,
      ...safeInput,
      ...secretData,
      appId: input.appId || null,
      instagramAppId: existing?.instagramAppId || null,
      instagramAppSecretEncrypted: existing?.instagramAppSecretEncrypted || null,
      updatedById,
    },
    update: {
      ...safeInput,
      ...secretData,
      appId: input.appId || null,
      updatedById,
    },
  });
  return getPlatformMetaSettingsForAdmin();
}
